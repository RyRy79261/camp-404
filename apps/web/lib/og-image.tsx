import { ImageResponse } from "next/og";

/* Shared renderer for the social-share / app-icon imagery. Everything is
   generated at build time by `next/og` (Satori) so there are no binary
   assets to commit and the artwork stays in sync with the brand in code.

   It recreates the landing page's glitched "404" — the magenta/cyan
   RGB-split chromatic aberration on a midnight-violet field — as a single
   static frame (link-preview crawlers and browser tabs don't animate, so
   one crisp frame renders identically everywhere). */

// Hex equivalents of the oklch design tokens in packages/ui globals.css.
const BACKGROUND = "#0d061e"; // --color-background / themeColor
const FOREGROUND = "#f7ecf3"; // --color-foreground (off-white pink)
const MUTED = "#b29ab0"; // --color-muted-foreground
const MAGENTA = "rgba(255, 0, 140, 0.92)"; // primary glitch channel
const CYAN = "rgba(0, 220, 255, 0.92)"; // accent glitch channel

export const SHARE_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_CONTENT_TYPE = "image/png";
export const SHARE_ALT =
  "Camp 404 — a glitched 404 logo on a midnight-violet field. A calm command centre for a chaotic desert.";

/** 1200×630 Open Graph / Twitter share card. */
export function renderShareImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: BACKGROUND,
          padding: "76px 80px",
          position: "relative",
        }}
      >
        {/* Soft magenta bloom behind the mark. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle at 50% 46%, rgba(255,0,160,0.20), rgba(13,6,30,0) 58%)",
          }}
        />

        {/* Kicker + error line. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 18,
              color: MUTED,
              textTransform: "uppercase",
            }}
          >
            Camp 404
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 8,
              color: FOREGROUND,
              textTransform: "uppercase",
              textShadow: `-2px 0 0 ${MAGENTA}, 2px 0 0 ${CYAN}`,
            }}
          >
            Error 404 — Camp not found
          </div>
        </div>

        {/* The giant glitched 404 — three stacked layers (magenta nudged
            left, cyan nudged right, foreground on top) reproduce the
            landing page's RGB-split chromatic aberration. */}
        <Glitch404 fontSize={320} split={14} glow={80} />


        {/* Tagline. */}
        <div
          style={{
            display: "flex",
            fontSize: 32,
            letterSpacing: 2,
            color: MUTED,
            textAlign: "center",
          }}
        >
          A calm command centre for a chaotic desert.
        </div>
      </div>
    ),
    { ...SHARE_SIZE },
  );
}

/** Square app icon (Apple touch icon / maskable). `size` is the pixel edge. */
export function renderSquareIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BACKGROUND,
        }}
      >
        <Glitch404
          fontSize={Math.round(size * 0.46)}
          split={Math.max(2, Math.round(size * 0.035))}
        />
      </div>
    ),
    { width: size, height: size },
  );
}

/** Stacked, RGB-split "404" mark shared by the share card and the icons. */
function Glitch404({
  fontSize,
  split,
  glow = 0,
}: {
  fontSize: number;
  split: number;
  glow?: number;
}) {
  const glyph = {
    fontSize,
    fontWeight: 800,
    letterSpacing: -Math.round(fontSize * 0.05),
    lineHeight: 1,
  } as const;
  const channel = {
    ...glyph,
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div style={{ ...channel, color: MAGENTA, transform: `translate(-${split}px, 0)` }}>
        404
      </div>
      <div style={{ ...channel, color: CYAN, transform: `translate(${split}px, 0)` }}>
        404
      </div>
      <div
        style={{
          ...glyph,
          display: "flex",
          position: "relative",
          color: FOREGROUND,
          // Satori chokes on `textShadow: undefined`, so only set it when glowing.
          ...(glow ? { textShadow: `0 0 ${glow}px rgba(255,0,200,0.32)` } : {}),
        }}
      >
        404
      </div>
    </div>
  );
}
