import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  mixOklch,
  oklabDistance,
  simulate,
  type VisionDeficiency,
} from "../contrast";
import { OS_THEMES_DEF, type OsThemeDef } from "../os-themes";

// Every 404 OS theme's contrast (issue #290), read from the themes' own values
// (lib/os-themes.ts), so a change to a colour is measured again here. The
// mixes the chrome draws (a lifted quiet colour, a lifted magenta) are mixed
// as the browser mixes them, in oklch (lib/contrast.ts).
//
// Every pair the chrome and a window actually draw is listed below, so a new
// pair is measured when it is added, and the one exception is written down.
// Text meets the theme's level: AA (4.5:1) for all, AAA (7:1) for High
// contrast, which promises it. An icon or a focus ring meets 3:1 (WCAG 1.4.11).

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

type Pair = [what: string, text: string, surface: string, least: number];

function pairs(theme: OsThemeDef): Pair[] {
  const c = theme.colours;
  const text = theme.textLevel === "AAA" ? 7 : 4.5;
  /** Small magenta text, lifted: color-mix(primary 70%, fg). */
  const primaryText = mixOklch(c["--os-primary"], c["--os-fg"], 0.7);
  /** The blue lifted: color-mix(accent 65%, fg), the skin's --color-accent. */
  const accentText = mixOklch(c["--os-accent"], c["--os-fg"], 0.65);
  /** The quiet colour lifted, for an unfocused title: color-mix(muted 60%, fg). */
  const mutedLifted = mixOklch(c["--os-muted"], c["--os-fg"], 0.6);
  const list: Pair[] = [
    ["body text on the desktop", c["--os-fg"], c["--os-bg"], text],
    ["body text on a panel", c["--os-fg"], c["--os-panel"], text],
    ["quiet text on the desktop", c["--os-muted"], c["--os-bg"], text],
    ["quiet text on a panel", c["--os-muted"], c["--os-panel"], text],
    [
      "a lit row, a chip, an open icon's name (dark on the main colour)",
      c["--os-bg"],
      c["--os-primary"],
      text,
    ],
    [
      "an unfocused window's title on the chrome",
      mutedLifted,
      c["--os-chrome"],
      text,
    ],
    ["the taskbar's text on the chrome", c["--os-fg"], c["--os-chrome"], text],
    ["small magenta text on a panel", primaryText, c["--os-panel"], text],
    ["small magenta text on the desktop", primaryText, c["--os-bg"], text],
    ["small blue text on a panel", accentText, c["--os-panel"], text],
    ["a delete row in a menu", c["--os-danger"], c["--os-panel"], text],
    [
      "an icon on a panel or the Start menu",
      c["--os-accent"],
      c["--os-panel"],
      3,
    ],
    ["an icon on the desktop", c["--os-accent"], c["--os-bg"], 3],
    ["an icon on the chrome (Today's strip)", accentText, c["--os-chrome"], 3],
    ["the focus ring on a panel", c["--os-primary"], c["--os-panel"], 3],
    ["the focus ring on the chrome", c["--os-fg"], c["--os-chrome"], 3],
    // Inside a program window.
    ["a window's body text", c["--os-win-fg"], c["--os-win-bg"], text],
    ["a window's text on a card", c["--os-win-fg"], c["--os-win-card"], text],
    ["a window's quiet text", c["--os-win-muted-fg"], c["--os-win-bg"], text],
    [
      "a window's quiet text on a card",
      c["--os-win-muted-fg"],
      c["--os-win-card"],
      text,
    ],
    [
      "a window's quiet text on a muted strip",
      c["--os-win-muted-fg"],
      c["--os-win-muted"],
      text,
    ],
    [
      "a window's main button",
      c["--os-win-primary-fg"],
      c["--os-win-primary"],
      text,
    ],
    [
      "a window's second button",
      c["--os-win-secondary-fg"],
      c["--os-win-secondary"],
      text,
    ],
    ["a window's link", c["--os-win-primary"], c["--os-win-bg"], text],
    ["a window's focus ring", c["--os-win-primary"], c["--os-win-card"], 3],
  ];
  // The title bar: the one recorded exception is 404 Night's (below).
  if (theme.id !== "night") {
    list.push([
      "a focused window's title bar",
      c["--os-primary-fg"],
      c["--os-primary"],
      text,
    ]);
  }
  return list;
}

describe.each(OS_THEMES_DEF.map((t) => [t.label, t] as const))(
  "%s: contrast (WCAG 2)",
  (_label, theme) => {
    it.each(pairs(theme))("%s", (_what, text, surface, least) => {
      expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(least);
    });
  },
);

describe("High contrast", () => {
  it("promises AAA, and its borders and field edges reach 7:1 too", () => {
    const hc = OS_THEMES_DEF.find((t) => t.id === "high-contrast")!;
    expect(hc.textLevel).toBe("AAA");
    const c = hc.colours;
    expect(contrastRatio(c["--os-line"], c["--os-bg"])).toBeGreaterThanOrEqual(
      7,
    );
    expect(
      contrastRatio(c["--os-win-border"], c["--os-win-bg"]),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrastRatio(c["--os-win-input"], c["--os-win-bg"]),
    ).toBeGreaterThanOrEqual(7);
  });
});

// The colour-blind safe theme's promise: its two colours that carry meaning
// (the main one: an open icon, the focused window, a count; the second: the
// icons, a done toast's stripe) stay apart under each kind of colour
// blindness, simulated as Chrome's emulation does. 0.15 in OKLab is a clear
// difference; 404 Night's magenta and blue fall to about 0.1 under
// protanopia, which is why the theme exists.
const DEFICIENCIES: VisionDeficiency[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
];
const APART = 0.15;

function apart(theme: OsThemeDef, kind: VisionDeficiency): number {
  return oklabDistance(
    simulate(theme.colours["--os-primary"], kind),
    simulate(theme.colours["--os-accent"], kind),
  );
}

describe("Colour-blind safe", () => {
  const safe = OS_THEMES_DEF.find((t) => t.id === "colour-blind")!;
  const night = OS_THEMES_DEF.find((t) => t.id === "night")!;

  it.each(DEFICIENCIES)(
    "keeps its main colour and its second colour apart under %s",
    (kind) => {
      expect(apart(safe, kind)).toBeGreaterThanOrEqual(APART);
    },
  );

  it("is needed: 404 Night's pair comes too close under protanopia", () => {
    expect(apart(night, "protanopia")).toBeLessThan(APART);
  });
});

describe("the skin", () => {
  it("puts the dark background on a filled main button (decision 4 A)", () => {
    // --color-primary-foreground is --os-bg inside the skin.
    expect(css).toMatch(/--color-primary-foreground:\s*var\(--os-bg\)/);
  });

  it("measures the one exception: 404 Night's near-white on the magenta title bar, below 4.5:1", () => {
    // The owner approved the prototype's title bars (2026-09-26): near-white
    // Silkscreen on this magenta, on a focused window, a dialog, the blocking
    // form, a gate and a phone sheet, and the Start menu's spine. Recorded,
    // not hidden: about 3.6:1, under AA for small text (visual-language doc
    // 2.3). Everything else on magenta carries the dark violet above, and
    // every other theme meets its level on the title bar (the pairs above).
    const c = OS_THEMES_DEF.find((t) => t.id === "night")!.colours;
    const r = contrastRatio(c["--os-primary-fg"], c["--os-primary"]);
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThan(4.5);
  });

  it("would fail 404 Night's chrome pairs with the plain colours, which is why they are lifted", () => {
    const c = OS_THEMES_DEF.find((t) => t.id === "night")!.colours;
    expect(contrastRatio(c["--os-muted"], c["--os-chrome"])).toBeLessThan(4.5);
    expect(contrastRatio(c["--os-primary"], c["--os-chrome"])).toBeLessThan(3);
    expect(contrastRatio(c["--os-accent"], c["--os-chrome"])).toBeLessThan(3);
    expect(contrastRatio(c["--os-primary"], c["--os-panel"])).toBeLessThan(4.5);
  });
});

// The near-white on magenta, only where the exception above allows it: the
// title bars and the Start menu's spine. A row, a chip or a button that
// wears it would be 3.6:1 small text.
const ROOT = path.join(__dirname, "../../../..");
const TITLE_BARS = new Set([
  "packages/os/src/os-window.tsx",
  "packages/os/src/blocking-layer.tsx",
  "packages/os/src/folder-name-dialog.tsx",
  "packages/os/src/start-menu.tsx",
  "apps/web/components/auth-shell.tsx",
  "apps/web/components/os/phone-chrome.tsx",
  // The welcome wizard's practice window.
  "apps/web/components/os/welcome-wizard.tsx",
]);

function sources(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(
      (e) =>
        e.isFile() && /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name),
    )
    .map((e) =>
      path
        .relative(ROOT, path.join(e.parentPath, e.name))
        .split(path.sep)
        .join("/"),
    );
}

describe("where the console puts near-white on magenta", () => {
  it("is only a title bar (or the Start menu's spine)", () => {
    const wearing = [
      ...sources("packages/os/src"),
      ...sources("apps/web/components"),
      ...sources("apps/web/app"),
    ].filter((file) =>
      /text-os-primary-fg/.test(readFileSync(path.join(ROOT, file), "utf8")),
    );
    expect(wearing.length).toBeGreaterThan(0);
    expect(wearing.filter((file) => !TITLE_BARS.has(file))).toEqual([]);
  });

  it("in those files, wears it once each (twice for the Start menu's two spines)", () => {
    for (const file of TITLE_BARS) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      const count = text.match(/text-os-primary-fg/g)?.length ?? 0;
      expect([file, count]).toEqual([
        file,
        file.endsWith("start-menu.tsx") ? 2 : 1,
      ]);
    }
  });
});
