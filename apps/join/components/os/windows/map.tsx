import { MAP } from "@/lib/content";
import { WinBody } from "./ui";

// A schematic of the plot, not a survey: the dune and toilets behind,
// sleeping at the back, the lounge up front with its sound facing away.
export function MapWindow() {
  return (
    <WinBody>
      <figure className="border border-os-line bg-os-bg/70 p-2">
        <svg
          viewBox="0 0 400 260"
          role="img"
          aria-label={`Plot ${MAP.plot}: the dune and a row of toilets at the back, the sleeping tent in front of them, the kitchen in the middle and the lounge at the front, its sound pointing away from sleeping.`}
          className="w-full font-mono"
          fill="none"
          stroke="currentColor"
        >
          <g className="text-os-muted" strokeWidth="1">
            <path d="M10 30 q20 -18 40 0 t40 0 t40 0 t40 0 t40 0" />
            <path d="M10 42 q20 -14 40 0 t40 0 t40 0 t40 0 t40 0" />
          </g>
          <text
            x="95"
            y="18"
            className="fill-os-muted text-[9px]"
            stroke="none"
          >
            SAND DUNE
          </text>
          <g className="text-os-accent" strokeWidth="1.2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={262 + i * 20} y="18" width="14" height="22" />
            ))}
          </g>
          <text
            x="268"
            y="54"
            className="fill-os-accent text-[9px]"
            stroke="none"
          >
            TOILETS
          </text>
          <rect
            x="30"
            y="64"
            width="340"
            height="186"
            className="text-os-line"
            strokeDasharray="4 4"
          />
          <text
            x="36"
            y="78"
            className="fill-os-muted text-[9px]"
            stroke="none"
          >
            PLOT {MAP.plot}
          </text>
          <rect
            x="70"
            y="84"
            width="200"
            height="70"
            className="text-os-accent"
          />
          <text
            x="112"
            y="124"
            className="fill-os-fg text-[10px]"
            stroke="none"
          >
            SLEEPING · 20×30 M
          </text>
          <rect
            x="290"
            y="100"
            width="64"
            height="54"
            className="text-os-accent"
          />
          <text
            x="298"
            y="131"
            className="fill-os-fg text-[10px]"
            stroke="none"
          >
            KITCHEN
          </text>
          <rect
            x="120"
            y="178"
            width="160"
            height="56"
            className="text-os-primary"
            strokeWidth="1.5"
          />
          <text
            x="176"
            y="210"
            className="fill-os-fg text-[10px]"
            stroke="none"
          >
            LOUNGE
          </text>
          <g className="text-os-primary" strokeWidth="1.2">
            <path d="M200 236 v18 M194 248 l6 6 6 -6" />
            <path d="M150 236 l-10 16 M140 244 l0 8 8 -2" />
            <path d="M250 236 l10 16 M260 244 l0 8 -8 -2" />
          </g>
          <text
            x="286"
            y="252"
            className="fill-os-primary text-[8px]"
            stroke="none"
          >
            SOUND → AWAY
          </text>
          <g className="camp404-cursor">
            <circle
              cx="200"
              cy="170"
              r="4"
              className="fill-os-primary text-os-primary"
            />
          </g>
          <text
            x="208"
            y="172"
            className="fill-os-primary text-[8px]"
            stroke="none"
          >
            YOU ARE HERE
          </text>
        </svg>
      </figure>
      <ul className="space-y-1">
        {MAP.lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span aria-hidden className="text-os-primary">
              ›
            </span>
            {l}
          </li>
        ))}
      </ul>
    </WinBody>
  );
}
