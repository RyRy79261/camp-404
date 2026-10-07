// Colour arithmetic for checking the 404 OS themes (lib/os-themes.ts): WCAG
// contrast between two colours, and how two colours look to someone with a
// colour-vision deficiency. Pure, no dependencies; used by the themes' tests.
//
// It reads the two colour notations the themes use: `#rrggbb` and
// `oklch(L C H)` (L 0 to 1). Anything else throws, so a theme that starts
// using another notation fails its test instead of passing unchecked.

/** A colour as linear-light sRGB channels, 0 to 1 (clipped to the gamut). */
export type LinearRgb = readonly [number, number, number];

const clip = (v: number) => Math.min(1, Math.max(0, v));

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function oklabToLinear(L: number, a: number, b: number): LinearRgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Linear sRGB to OKLab, for measuring how far apart two colours look. */
export function linearToOklab([r, g, b]: LinearRgb): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** A theme's colour value as linear sRGB. */
export function parseColour(value: string): LinearRgb {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [
      srgbToLinear(((n >> 16) & 255) / 255),
      srgbToLinear(((n >> 8) & 255) / 255),
      srgbToLinear((n & 255) / 255),
    ];
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v);
  if (ok) {
    const L = Number(ok[1]);
    const C = Number(ok[2]);
    const h = (Number(ok[3]) * Math.PI) / 180;
    return oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  }
  throw new Error(`Not a colour this check reads: ${value}`);
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseColour(a));
  const lb = luminance(parseColour(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type VisionDeficiency = "protanopia" | "deuteranopia" | "tritanopia";

// Machado, Oliveira and Fernandes (2009), severity 1.0, on linear sRGB: the
// matrices Chrome's own vision-deficiency emulation is built from.
const MACHADO: Record<VisionDeficiency, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
    -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
    0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733,
    0.691367, 0.3039,
  ],
};

/** How a colour looks under a full deficiency, as linear sRGB. */
export function simulate(value: string, kind: VisionDeficiency): LinearRgb {
  const [r, g, b] = parseColour(value);
  const m = MACHADO[kind];
  return [
    clip(m[0]! * r + m[1]! * g + m[2]! * b),
    clip(m[3]! * r + m[4]! * g + m[5]! * b),
    clip(m[6]! * r + m[7]! * g + m[8]! * b),
  ];
}

/** Distance between two colours in OKLab (about 0.02 is just noticeable). */
export function oklabDistance(a: LinearRgb, b: LinearRgb): number {
  const [l1, a1, b1] = linearToOklab(a);
  const [l2, a2, b2] = linearToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A theme's colour as oklch: [L, C, H in degrees]. */
export function toOklch(value: string): [number, number, number] {
  const [L, a, b] = linearToOklab(parseColour(value));
  const C = Math.hypot(a, b);
  const H = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

/**
 * `color-mix(in oklch, a p%, b)` as the browser mixes it (the shorter way
 * round the hue; an achromatic colour takes the other's hue), as an
 * `oklch()` string this module reads. `p` is 0 to 1.
 */
export function mixOklch(a: string, b: string, p: number): string {
  const [l1, c1, h1Raw] = toOklch(a);
  const [l2, c2, h2Raw] = toOklch(b);
  // A grey has no hue: CSS treats it as missing and takes the other's.
  const h1 = c1 < 1e-4 ? h2Raw : h1Raw;
  const h2 = c2 < 1e-4 ? h1 : h2Raw;
  let d = h2 - h1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const L = l1 * p + l2 * (1 - p);
  const C = c1 * p + c2 * (1 - p);
  const H = (h1 + d * (1 - p) + 360) % 360;
  return `oklch(${L.toFixed(5)} ${C.toFixed(5)} ${H.toFixed(3)})`;
}

/**
 * `color-mix(in oklab, a p%, b)` as the browser mixes it: each of L, a and b
 * mixed in a straight line, as an `oklch()` string this module reads. The
 * console's soft tints use it: a grey with a faint hue of its own (the window
 * card's blue-grey) would pull an oklch mix round to its own hue, and a
 * magenta tint would come out blue. `p` is 0 to 1.
 */
export function mixOklab(a: string, b: string, p: number): string {
  const [l1, a1, b1] = linearToOklab(parseColour(a));
  const [l2, a2, b2] = linearToOklab(parseColour(b));
  const L = l1 * p + l2 * (1 - p);
  const A = a1 * p + a2 * (1 - p);
  const B = b1 * p + b2 * (1 - p);
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return `oklch(${L.toFixed(5)} ${C.toFixed(5)} ${H.toFixed(3)})`;
}
