// Pixel-art team icons, copied from Join (apps/join/components/os/pixel-icons.tsx,
// the approved prototype's Teams folder), one "#" per pixel. Each renders
// three times: a magenta and a cyan copy knocked sideways under the white
// one, the landing page's chromatic glitch in pixels (.pixel-glitch-* in
// app/globals.css). Which team wears which drawing is Join's table
// (apps/join/lib/teams.ts); a team added later gets the generic one.

export type TeamIcon =
  | "comms"
  | "finance"
  | "structures"
  | "safety"
  | "kitchen"
  | "water"
  | "sanitation"
  | "vibes"
  | "memes"
  | "power"
  | "sound"
  | "art"
  | "mutant"
  | "transport"
  | "generic";

const BY_KEY: Readonly<Record<string, TeamIcon>> = {
  communications_and_hr: "comms",
  finance: "finance",
  structures: "structures",
  health_and_safety: "safety",
  kitchen: "kitchen",
  water: "water",
  sanitation_and_water: "sanitation",
  ministry_of_vibes: "vibes",
  ministry_of_memes: "memes",
  power_and_lighting: "power",
  sound: "sound",
  art_and_activities: "art",
  mutant_vehicle: "mutant",
  transport_and_logistics: "transport",
};

/** The drawing a team wears, by its key. */
export function teamPixelIcon(teamKey: string): TeamIcon {
  return BY_KEY[teamKey] ?? "generic";
}

const GRIDS: Record<TeamIcon, readonly string[]> = {
  comms: [
    "............",
    ".........##.",
    ".......####.",
    "..#######.#.",
    ".##.......#.",
    ".##.......#.",
    "..#######.#.",
    "...#...####.",
    "...#.....##.",
    "...##.......",
  ],
  finance: [
    "...######...",
    "..#......#..",
    ".#.####...#.",
    ".#.#...#..#.",
    ".#.#...#..#.",
    ".#.####...#.",
    ".#.#..#...#.",
    ".#.#...#..#.",
    "..#......#..",
    "...######...",
  ],
  structures: [
    ".....##.....",
    "....#..#....",
    "...#....#...",
    "..#......#..",
    ".#........#.",
    "############",
    ".#...##...#.",
    ".#..#..#..#.",
    ".#..#..#..#.",
    ".#..#..#..#.",
  ],
  safety: [
    "....####....",
    "....#..#....",
    "....#..#....",
    "#####..#####",
    "#..........#",
    "#..........#",
    "#####..#####",
    "....#..#....",
    "....#..#....",
    "....####....",
  ],
  kitchen: [
    "..#..#..#...",
    "...#..#..#..",
    "..#..#..#...",
    "............",
    ".##########.",
    "############",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    "..########..",
  ],
  water: [
    ".....##.....",
    "....#..#....",
    "...#....#...",
    "..#......#..",
    ".#........#.",
    ".#.#......#.",
    ".#.#......#.",
    ".#..#.....#.",
    "..#......#..",
    "...######...",
  ],
  sanitation: [
    "....####....",
    "############",
    ".#........#.",
    ".#.#.##.#.#.",
    ".#.#.##.#.#.",
    ".#.#.##.#.#.",
    ".#.#.##.#.#.",
    ".#........#.",
    "..########..",
    "............",
  ],
  vibes: [
    "#.......#...#",
    "##.....##..###",
    "#.#...#.#...#.",
    "#..###..#.....",
    "#.......#...#.",
    "#.##..##.#.###",
    "#.......#...#.",
    "#...#...#.....",
    ".#.#.#.#......",
    "..#####.......",
  ],
  memes: [
    "..########..",
    ".#........#.",
    "#..##..##..#",
    "#..##..##..#",
    "#..........#",
    "#.#......#.#",
    "#..######..#",
    ".#........#.",
    "..########..",
    "............",
  ],
  power: [
    ".......###..",
    "......###...",
    ".....###....",
    "....###.....",
    "...#######..",
    ".....###....",
    "....###.....",
    "...###......",
    "..###.......",
    "..#.........",
  ],
  art: [
    "...######...",
    "..#......#..",
    ".#.##..##.#.",
    "#..##..##..#",
    "#..........#",
    "#.##....####",
    "#.##...#....",
    ".#.....#....",
    "..######....",
    "............",
  ],
  mutant: [
    ".#......#...",
    ".##....##...",
    ".########...",
    "##......###.",
    "#..#..#...##",
    "#..........#",
    "############",
    ".##.....##..",
    ".##.....##..",
    "............",
  ],
  sound: [
    "....#.......",
    "...##...#...",
    "..#.#....#..",
    "###.#..#..#.",
    "#...#...#.#.",
    "#...#...#.#.",
    "###.#..#..#.",
    "..#.#....#..",
    "...##...#...",
    "....#.......",
  ],
  // A team added after the site was drawn.
  generic: [
    "##########..",
    "#.#....#.##.",
    "#.#....#..#.",
    "#.######..#.",
    "#.........#.",
    "#.#######.#.",
    "#.#.....#.#.",
    "#.#.....#.#.",
    "#.#.....#.#.",
    "##########..",
  ],
  transport: [
    "..#####.........",
    ".#.#..##........",
    "#..#...##.......",
    "##########..####",
    "#.........#=#..#",
    "##########..####",
    ".##....##....##.",
    ".##....##....##.",
  ],
};

function Pixels({
  grid,
  className,
}: {
  grid: readonly string[];
  className: string;
}) {
  return (
    <g className={className}>
      {grid.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "#" || c === "=" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
          ) : null,
        ),
      )}
    </g>
  );
}

export function PixelIcon({
  icon,
  className,
}: {
  icon: TeamIcon;
  className?: string;
}) {
  const grid = GRIDS[icon];
  const w = Math.max(...grid.map((r) => r.length));
  const h = grid.length;
  const size = Math.max(w, h);
  return (
    <svg
      viewBox={`-1 ${-(size - h) / 2 - 1} ${size + 2} ${size + 2}`}
      shapeRendering="crispEdges"
      aria-hidden
      className={`pixel-glitch ${className ?? ""}`}
    >
      <Pixels
        grid={grid}
        className="pixel-glitch-m fill-[rgb(255_0_140/0.85)]"
      />
      <Pixels
        grid={grid}
        className="pixel-glitch-c fill-[rgb(0_220_255/0.85)]"
      />
      <Pixels grid={grid} className="fill-current" />
    </svg>
  );
}
