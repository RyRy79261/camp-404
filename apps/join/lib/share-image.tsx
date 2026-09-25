import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CAT_FRAMES, type Sprite } from "@camp404/games/inkblot/art";

// join.camp-404.com's link preview (owner, 2026-09-25): "Are you lost? Join
// 404", with Jinn, INKBLOT.EXE's black cat, and a 16-bit question mark over
// his head on the right. Drawn by next/og at build time; no image files.

export const SHARE_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_ALT =
  "A black pixel cat with a question mark over his head. Are you lost? Join 404.";

// Hex, because the image renderer does not read the site's oklch tokens.
const BG = "#140a24"; // --color-os-bg
const FG = "#f7ecf3"; // --color-os-fg
const MAGENTA = "#ff008c";
const CYAN = "#00dcff";
const PINK = "#f02fc2"; // --color-os-primary

// Jinn's colours: coat, sheen, outline, eye (INKBLOT's COLOURS).
const CAT_COLOURS: Record<string, string> = {
  K: "#0b0714",
  D: "#2e2342",
  O: "#030205",
  E: "#ff3fb4",
};

// A 16-bit question mark: white face, pink shadow, dark outline.
const QUESTION: Sprite = [
  "..OOOOO..",
  ".OWWWWWO.",
  "OWWPPPWWO",
  "OWPO.OWWO",
  ".O..OWWPO",
  "...OWWPO.",
  "...OWPO..",
  "...OOOO..",
  ".........",
  "...OOOO..",
  "...OWPO..",
  "...OOOO..",
];
const QUESTION_COLOURS = { O: "#030205", W: FG, P: PINK };

function Pixels({
  sprite,
  px,
  colours,
}: {
  sprite: Sprite;
  px: number;
  colours: Record<string, string>;
}) {
  const w = Math.max(...sprite.map((r) => r.length));
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: w * px,
        height: sprite.length * px,
      }}
    >
      {sprite.flatMap((row, y) =>
        [...row].map((c, x) =>
          colours[c] ? (
            <div
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * px,
                top: y * px,
                width: px,
                height: px,
                backgroundColor: colours[c],
              }}
            />
          ) : null,
        ),
      )}
    </div>
  );
}

/** Jinn sitting, the question mark bobbing over his head. */
function JinnWondering({ px }: { px: number }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div
        style={{ display: "flex", marginLeft: px * 6, marginBottom: px * -2 }}
      >
        <Pixels
          sprite={QUESTION}
          px={Math.round(px * 0.85)}
          colours={QUESTION_COLOURS}
        />
      </div>
      <Pixels sprite={CAT_FRAMES.idle[0]!} px={px} colours={CAT_COLOURS} />
    </div>
  );
}

/** "JOIN 404" with the landing page's magenta/cyan split. */
function GlitchText({ text, size }: { text: string; size: number }) {
  const layer = (color: string, dx: number) =>
    ({
      position: "absolute",
      left: dx,
      top: 0,
      color,
      fontSize: size,
      lineHeight: 1,
      display: "flex",
      whiteSpace: "nowrap",
    }) as const;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <div style={layer(MAGENTA, -6)}>{text}</div>
      <div style={layer(CYAN, 6)}>{text}</div>
      <div
        style={{
          display: "flex",
          position: "relative",
          color: FG,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Words() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div
        style={{ display: "flex", fontSize: 44, color: PINK, letterSpacing: 4 }}
      >
        ARE YOU LOST?
      </div>
      <GlitchText text="JOIN 404" size={108} />
    </div>
  );
}

// The owner's pick of three drafts (2026-09-25): the site's own APPLY.EXE
// window, Jinn sitting beside it on the taskbar.
function Layout() {
  const base = {
    width: "100%",
    height: "100%",
    display: "flex",
    backgroundColor: BG,
    fontFamily: "Silkscreen",
    position: "relative",
  } as const;

  // "window": the site's own OS window, Jinn sitting on the taskbar.
  return (
    <div style={{ ...base, flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          paddingLeft: 70,
          paddingRight: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 700,
            border: `4px solid ${PINK}`,
            boxShadow: `14px 14px 0 0 #000`,
            backgroundColor: "#221733",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              backgroundColor: PINK,
              color: FG,
              fontSize: 26,
              letterSpacing: 6,
              padding: "10px 20px",
            }}
          >
            <div style={{ display: "flex" }}>APPLY.EXE</div>
            <div style={{ display: "flex" }}>_ [] X</div>
          </div>
          <div style={{ display: "flex", padding: "44px 40px 52px" }}>
            <Words />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            justifyContent: "center",
            alignItems: "flex-end",
            alignSelf: "flex-end",
            marginBottom: -4,
          }}
        >
          <JinnWondering px={16} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          height: 64,
          backgroundColor: "#4a3e5e",
          borderTop: `4px solid ${PINK}`,
          alignItems: "center",
          paddingLeft: 24,
          color: FG,
          fontSize: 26,
        }}
      >
        404 START
      </div>
    </div>
  );
}

export async function renderShareImage(): Promise<ImageResponse> {
  const font = await readFile(
    join(process.cwd(), "assets/Silkscreen-Regular.ttf"),
  );
  return new ImageResponse(<Layout />, {
    ...SHARE_SIZE,
    fonts: [{ name: "Silkscreen", data: font, style: "normal", weight: 400 }],
  });
}
