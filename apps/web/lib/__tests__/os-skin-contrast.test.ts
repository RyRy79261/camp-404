import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The 404 OS palette's contrast, read from the stylesheet the console ships
// (app/globals.css), so a change to a colour is measured again here. OKLCH to
// linear sRGB by the standard OKLab matrices, then the WCAG 2 ratio. The
// surfaces (panel, chrome) are mixes of the background and the text colour,
// read from the same file, and mixed as the browser mixes them (in oklch).
//
// Every pair the chrome actually draws is listed below, so a new pair is
// measured when it is added, and the one exception is written down.

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

type Oklch = [number, number, number];

function token(name: string): Oklch {
  const m = new RegExp(
    `--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`,
  ).exec(css);
  if (!m) throw new Error(`--${name} is not an oklch() value`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** `a` at `p` (0 to 1) mixed with `b`, in oklch, the shorter way round. */
function mix(a: Oklch, b: Oklch, p: number): Oklch {
  let d = b[2] - a[2];
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return [
    a[0] * p + b[0] * (1 - p),
    a[1] * p + b[1] * (1 - p),
    a[2] + d * (1 - p),
  ];
}

/** A surface the stylesheet mixes from bg and fg: `--os-panel: color-mix(… bg N%, fg)`. */
function surface(name: string): Oklch {
  const m = new RegExp(
    `--${name}:\\s*color-mix\\(in oklch, var\\(--os-bg\\) ([\\d.]+)%, var\\(--os-fg\\)\\)`,
  ).exec(css);
  if (!m) throw new Error(`--${name} is not a bg/fg mix`);
  return mix(token("os-bg"), token("os-fg"), Number(m[1]) / 100);
}

/** Relative luminance of an oklch colour, clipped into sRGB. */
function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return 0.2126 * clip(r) + 0.7152 * clip(g) + 0.0722 * clip(bl);
}

function ratio(fg: Oklch, bg: Oklch): number {
  const [x, y] = [luminance(fg), luminance(bg)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const bg = token("os-bg");
const fg = token("os-fg");
const primary = token("os-primary");
const primaryFg = token("os-primary-fg");
const muted = token("os-muted");
const accent = token("os-accent");
const panel = surface("os-panel");
const chrome = surface("os-chrome");
/** Small magenta text, lifted: color-mix(primary 70%, fg). */
const primaryText = mix(primary, fg, 0.7);
/** The blue lifted: color-mix(accent 65%, fg). */
const accentText = mix(accent, fg, 0.65);
/** The quiet colour lifted, for an unfocused title: color-mix(muted 60%, fg). */
const mutedLifted = mix(muted, fg, 0.6);

// [what, text or mark, surface, the least it must reach]. 4.5 for text,
// 3 for an icon or a focus ring (WCAG 1.4.11).
const PAIRS: [string, Oklch, Oklch, number][] = [
  ["body text on the desktop", fg, bg, 4.5],
  ["body text in a window", fg, panel, 4.5],
  ["quiet text on the desktop", muted, bg, 4.5],
  ["quiet text in a window", muted, panel, 4.5],
  ["a filled magenta button, a lit row, an open icon's name", bg, primary, 4.5],
  ["an unfocused window's title on the chrome", mutedLifted, chrome, 4.5],
  ["the taskbar's text on the chrome", fg, chrome, 4.5],
  [
    "small magenta text in a window (Today's due line)",
    primaryText,
    panel,
    4.5,
  ],
  ["small magenta text on the desktop", primaryText, bg, 4.5],
  ["small blue text in a window (a link, an eyebrow)", accentText, panel, 4.5],
  ["an icon in a window or the Start menu", accent, panel, 3],
  ["an icon on the chrome (Today's strip)", accentText, chrome, 3],
  ["the focus ring on the desktop and in a window", primary, panel, 3],
  ["the focus ring on the taskbar and the phone's bar", fg, chrome, 3],
];

describe("the 404 OS skin's contrast (WCAG 2)", () => {
  it.each(PAIRS)("%s", (_what, text, surfaceColour, least) => {
    expect(ratio(text, surfaceColour)).toBeGreaterThanOrEqual(least);
  });

  it("puts the dark violet on a filled magenta button (decision 4 A)", () => {
    // --color-primary-foreground is --os-bg inside the skin.
    expect(css).toMatch(/--color-primary-foreground:\s*var\(--os-bg\)/);
  });

  it("measures the one exception: near-white on the magenta title bar, below 4.5:1", () => {
    // The owner approved the prototype's title bars (2026-09-26): near-white
    // Silkscreen on this magenta, on a focused window, a dialog, the blocking
    // form, a gate and a phone sheet, and the Start menu's spine. Recorded,
    // not hidden: about 3.6:1, under AA for small text (visual-language doc
    // 2.3). Everything else on magenta carries the dark violet above.
    const r = ratio(primaryFg, primary);
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThan(4.5);
  });

  it("would fail the chrome pairs with the plain colours, which is why they are lifted", () => {
    expect(ratio(muted, chrome)).toBeLessThan(4.5);
    expect(ratio(primary, chrome)).toBeLessThan(3);
    expect(ratio(accent, chrome)).toBeLessThan(3);
    expect(ratio(primary, panel)).toBeLessThan(4.5);
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
