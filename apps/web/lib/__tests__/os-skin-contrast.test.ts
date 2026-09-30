import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  mixOklab,
  luminance,
  parseColour as parse,
  toOklch,
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
const choiceSource = readFileSync(
  path.join(__dirname, "../../../../packages/ui/src/lib/choice.ts"),
  "utf8",
);

// The colour that stays on (owner, 2026-09-30), read from where it is written,
// so a change to a percentage is measured again here:
// `--name: color-mix(in oklab, var(--a) N%, var(--b))` in app/globals.css,
// from the theme's own rule when it has one, else from the rule every theme
// shares.
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m?.[1] ?? "";
}
function cssMix(
  name: string,
  themeId: string,
): { a: string; b: string; p: number } {
  const re = new RegExp(
    `${name}:\\s*color-mix\\(\\s*in oklab,\\s*var\\((--[\\w-]+)\\)\\s+(\\d+)%,\\s*var\\((--[\\w-]+)\\)\\s*\\)`,
  );
  const m =
    re.exec(cssBlock(`[data-os-theme="${themeId}"]`)) ??
    re.exec(cssBlock(":root,\n[data-os-theme]"));
  if (!m) throw new Error(`No oklab mix for ${name} in app/globals.css`);
  return { a: m[1]!, p: Number(m[2]) / 100, b: m[3]! };
}

/** How far a choice lifts its quiet text toward the text colour (0 to 1),
 * read from a constant of packages/ui/src/lib/choice.ts. */
function choiceLift(constant: string): number {
  const body = new RegExp(`export const ${constant} =\\s*"([^"]+)"`).exec(
    choiceSource,
  )?.[1];
  const m =
    /\[&_\.text-muted-foreground\]:text-\[color-mix\(in_oklab,var\(--color-muted-foreground\)_(\d+)%,var\(--color-foreground\)\)\]/.exec(
      body ?? "",
    );
  if (!m) throw new Error(`${constant} does not lift its quiet text`);
  return Number(m[1]) / 100;
}

/** A choice's tint, N% of the main colour in the card: the Nth such mix in a
 * constant of packages/ui/src/lib/choice.ts. */
function choicePct(constant: string, nth = 0): number {
  const body = new RegExp(`export const ${constant} =\\s*"([^"]+)"`).exec(
    choiceSource,
  )?.[1];
  if (!body) throw new Error(`No ${constant} in lib/choice.ts`);
  const all = [
    ...body.matchAll(
      /color-mix\(in_oklab,var\(--color-primary\)_(\d+)%,var\(--color-card\)\)/g,
    ),
  ];
  if (!all[nth]) throw new Error(`No tint #${nth} in ${constant}`);
  return Number(all[nth]![1]) / 100;
}

/**
 * A theme's value for a mix read from the CSS. A colour the stylesheet itself
 * derives (the tinted card a picked choice is mixed into) is worked out the
 * same way, from that theme's rule.
 */
function themed(
  theme: OsThemeDef,
  mix: { a: string; b: string; p: number },
): string {
  const value = (name: string): string => {
    const v = (theme.colours as Record<string, string>)[name];
    if (v) return v;
    return themed(theme, cssMix(name, theme.id));
  };
  return mixOklab(value(mix.a), value(mix.b), mix.p);
}

/** The colour a theme's rule gives a derived variable. */
function derived(theme: OsThemeDef, name: string): string {
  return themed(theme, cssMix(name, theme.id));
}

/**
 * The surfaces the colour that stays on draws in one theme: the chrome's
 * tints, a window's card, and a choice (not picked, under the pointer,
 * picked) in each place a choice sits: in a window, where the console sets
 * its colours (app/globals.css), and on the OS skin (a dialog, the blocking
 * form), where lib/choice.ts mixes the main colour into the panel.
 */
function softSurfaces(theme: OsThemeDef) {
  const c = theme.colours;
  const off = choicePct("CHOICE_OFF");
  const hover = choicePct("CHOICE_OFF", 1);
  const on = choicePct("CHOICE_ON");
  const onSkin = (p: number) => mixOklab(c["--os-primary"], c["--os-panel"], p);
  return {
    barIdle: derived(theme, "--os-bar-idle"),
    label: derived(theme, "--os-label"),
    winCard: derived(theme, "--os-win-card-tinted"),
    winChoice: {
      off: derived(theme, "--os-win-choice"),
      hover: derived(theme, "--os-win-choice-hover"),
      on: derived(theme, "--os-win-pick"),
    },
    winChoiceEdge: derived(theme, "--os-win-choice-edge"),
    skinChoice: { off: onSkin(off), hover: onSkin(hover), on: onSkin(on) },
  };
}

type Pair = [what: string, text: string, surface: string, least: number];

function pairs(theme: OsThemeDef): Pair[] {
  const c = theme.colours;
  const text = theme.textLevel === "AAA" ? 7 : 4.5;
  /** Small magenta text, lifted: color-mix(primary 70%, fg). */
  const primaryText = mixOklch(c["--os-primary"], c["--os-fg"], 0.7);
  /** The blue lifted: color-mix(accent 65%, fg), the skin's --color-accent. */
  const accentText = mixOklch(c["--os-accent"], c["--os-fg"], 0.65);
  const soft = softSurfaces(theme);
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
      "an unfocused window's title on its tinted bar",
      c["--os-fg"],
      soft.barIdle,
      text,
    ],
    ["an icon's name at rest, on its tint", c["--os-fg"], soft.label, text],
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
    ["a window's text on a card", c["--os-win-fg"], soft.winCard, text],
    ["a window's quiet text", c["--os-win-muted-fg"], c["--os-win-bg"], text],
    [
      "a window's quiet text on a card",
      c["--os-win-muted-fg"],
      soft.winCard,
      text,
    ],
    ["a window's link on a card", c["--os-win-primary"], soft.winCard, text],
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
    ["a window's focus ring", c["--os-win-primary"], soft.winCard, 3],
  ];
  // A choice, in a window and on the OS skin: its label and its description
  // on the soft colour, not picked, under the pointer and picked (a picked
  // segment is the main button's pair, above), and the tick or dot in the
  // main colour on a picked card.
  const places = [
    [
      "in a window",
      soft.winChoice,
      c["--os-win-fg"],
      c["--os-win-muted-fg"],
      c["--os-win-primary"],
    ],
    [
      "on the OS skin",
      soft.skinChoice,
      c["--os-fg"],
      c["--os-muted"],
      c["--os-primary"],
    ],
  ] as const;
  const lift = { off: choiceLift("CHOICE_OFF"), on: choiceLift("CHOICE_ON") };
  for (const [where, choice, fg, plainQuiet, primary] of places) {
    for (const state of ["off", "hover", "on"] as const) {
      // A choice lifts its quiet text toward the text colour (lib/choice.ts).
      const quiet = mixOklab(
        plainQuiet,
        fg,
        state === "on" ? lift.on : lift.off,
      );
      list.push([
        `a choice's label ${where} (${state})`,
        fg,
        choice[state],
        text,
      ]);
      list.push([
        `a choice's description ${where} (${state})`,
        quiet,
        choice[state],
        text,
      ]);
    }
    list.push([`a picked card's tick ${where}`, primary, choice.on, 3]);
  }
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

// The colour that stays on must not blur which window has focus, or which
// icon is lit or picked: the full-colour state stands clearly apart. Measured
// as a contrast between the two fills: 1.5:1 at least for the bar and the
// name (404 Night's is the closest, about 1.6:1, with the stronger tint the
// owner asked for), and each also changes more than its fill: the focused
// window gains its glow and its edge in the main colour, and a lit name turns
// its text dark (checked below). A picked segment stays 2:1 from the rest.
describe.each(OS_THEMES_DEF.map((t) => [t.label, t] as const))(
  "%s: the soft colour keeps the strong state apart",
  (_label, theme) => {
    const c = theme.colours;
    const soft = softSurfaces(theme);
    it("the focused title bar against one without focus", () => {
      expect(
        contrastRatio(c["--os-primary"], soft.barIdle),
      ).toBeGreaterThanOrEqual(1.5);
    });
    it("a lit icon's name against one at rest", () => {
      expect(
        contrastRatio(c["--os-primary"], soft.label),
      ).toBeGreaterThanOrEqual(1.5);
    });
    it("a picked segment against one not picked", () => {
      expect(
        contrastRatio(c["--os-win-primary"], soft.winChoice.off),
      ).toBeGreaterThanOrEqual(2);
    });
    it("a lit name and a focused bar change their text too", () => {
      // Resting and unfocused: the full text colour. Lit: the dark
      // background colour on the main colour; focused: the title-bar text.
      expect(c["--os-bg"]).not.toBe(c["--os-fg"]);
      expect(contrastRatio(c["--os-bg"], c["--os-fg"])).toBeGreaterThanOrEqual(
        7,
      );
      expect(css).toMatch(/--os-bar-idle-fg:\s*var\(--os-fg\)/);
    });
    it("makes a picked choice the brightest of its group", () => {
      const lum = (v: string) => luminance(parse(v));
      for (const choice of [soft.winChoice, soft.skinChoice]) {
        expect(lum(choice.on)).toBeGreaterThan(lum(choice.off) * 1.2);
        expect(lum(choice.on)).toBeGreaterThan(lum(choice.hover) * 1.1);
      }
    });
    it("tints nothing brown: the chrome's tints and everything in a window (owner, 2026-10-01)", () => {
      // Brown is a dark orange: a hue from red-orange to yellow at low
      // lightness. A grey (almost no chroma) is not brown.
      const window = [
        soft.barIdle,
        soft.label,
        soft.winCard,
        soft.winChoice.off,
        soft.winChoice.hover,
        soft.winChoice.on,
      ];
      for (const v of window) {
        const [L, C, H] = toOklch(v);
        const brown = C >= 0.02 && H >= 20 && H <= 110 && L < 0.6;
        expect([v, brown]).toEqual([v, false]);
      }
    });
    it("tints each surface: none is the plain grey it was", () => {
      expect(soft.barIdle).not.toBe(c["--os-chrome"]);
      expect(
        oklabDistance(parse(soft.winCard), parse(c["--os-win-card"])),
      ).toBeGreaterThan(0.01);
      expect(
        oklabDistance(parse(soft.label), parse(c["--os-chrome"])),
      ).toBeGreaterThan(0.05);
    });
  },
);

describe("the soft colour's text", () => {
  it("is the full text colour on a title bar without focus", () => {
    expect(css).toMatch(/--os-bar-idle-fg:\s*var\(--os-fg\)/);
  });
});

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
