import { DESK_COLOURS, type Sprite } from "../cats/sprites";
import { CLOUD_LOOK } from "./cloud";
import { DUST_COLOURS, DUST_FRAMES } from "./dust";
import { buildCharacter, withLapCat, type CharacterLook } from "./human";
import { mirrored, outlined, padded } from "./pixels";
import {
  PRINCE_LAP,
  PRINCE_LAP_FLICK,
  PRINCE_LEAP,
  PRINCE_RUN,
} from "./prince";

// Prince's reunion with Cloud (owner, 2026-09-26): the storyboard is
// prince-reunion.md. This is its data: every frame the scene shows, in the
// order it shows them, and how long each beat lasts. Pure: the scene
// (prince-reunion-scene.tsx) draws these once into one picture, and the
// timeline (prince-reunion-timeline.ts) says which shows when.

/** What she calls, one bubble each, with a breath between. */
export const REUNION_CALLS = [
  "Prince?",
  "Prince!",
  "Prince…",
  "Prince, where are you?",
] as const;

/** What a tap on the two of them says, in turn (as the clock Prince's pets). */
export const REUNION_TAPPED = ["prrr", "♥", "prrrrr", "mrrp", "♥"] as const;

/** The accessible name of the finished pair. Never names the secret. */
export const REUNION_LABEL = "Cloud and Prince";

/** The browser-session key that says the scene has played in this tab. */
export const REUNION_SEEN_KEY = "camp404:reunion-seen";

/** A small pixel heart, in the desktop's primary colour ("*"). */
export const HEART: Sprite = outlined(
  padded([".**.**.", "*******", "*******", ".*****.", "..***..", "...*..."]),
);

export type ReunionBeat = {
  id: string;
  /** How long it lasts, in ms. */
  ms: number;
  /** What it is for (for the storyboard; never shown). */
  note: string;
};

/**
 * The beats, in order. The walk in, then four calls (each a bubble, and a
 * look about between), the sprint, the leap, the dust, and the two of them
 * sitting together, which then stays for the rest of the session.
 */
export const REUNION_BEATS: readonly ReunionBeat[] = [
  { id: "walk-in", ms: 2000, note: "from the right edge to above the clock" },
  { id: "settle", ms: 300, note: "stops, faces the desktop" },
  { id: "call-1", ms: 900, note: "hand to mouth: Prince?" },
  { id: "look-1", ms: 500, note: "looks left" },
  { id: "call-2", ms: 900, note: "Prince!" },
  { id: "look-2", ms: 500, note: "looks right" },
  { id: "call-3", ms: 900, note: "Prince…" },
  { id: "pause", ms: 400, note: "a beat of quiet" },
  { id: "call-4", ms: 1500, note: "Prince, where are you?" },
  { id: "sprint", ms: 1200, note: "Prince runs in from the left edge" },
  { id: "leap", ms: 200, note: "he leaps; she throws her arms up" },
  { id: "dust", ms: 1500, note: "the cartoon dust cloud" },
  { id: "heart", ms: 1200, note: "the dust clears: a heart above them" },
];

/** The whole scene, in ms (about 12 s). */
export const REUNION_MS = REUNION_BEATS.reduce((t, b) => t + b.ms, 0);

/** When a beat starts, in ms from the start of the scene. */
export function beatStart(id: string): number {
  let t = 0;
  for (const b of REUNION_BEATS) {
    if (b.id === id) return t;
    t += b.ms;
  }
  throw new Error(`No reunion beat "${id}"`);
}

/** How long each frame of a cycle shows, in ms. */
export const WALK_FRAME_MS = 160;
export const RUN_FRAME_MS = 70;
export const DUST_FRAME_MS = 110;

/**
 * The dust's frames in the order shown: the hit, the brawl back and forth,
 * the cloud clearing. About 1.5 s at DUST_FRAME_MS.
 */
export const DUST_ORDER: readonly number[] = [
  0, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 3, 3,
];

export type ReunionFrames = {
  /** Walking in from the right, facing left. */
  walk: readonly Sprite[];
  /** Calling (facing left, towards where he will come from), then listening. */
  call: readonly Sprite[];
  /** Looking left, then right. */
  look: readonly Sprite[];
  idle: Sprite;
  surprised: Sprite;
  /** Prince's gallop and leap, facing right: he comes from the left. */
  run: readonly Sprite[];
  leap: Sprite;
  dust: readonly Sprite[];
  /** Sitting with Prince: eyes on the desktop, then content (the last frame). */
  together: readonly Sprite[];
  /** Content, his tail tip up: shown for a moment when she is tapped. */
  tapped: Sprite;
  heart: Sprite;
  /** One palette for every frame (the letters never collide). */
  palette: Readonly<Record<string, string>>;
};

/** Every frame of the scene for a person (Cloud; the look is a parameter). */
export function reunionFrames(look: CharacterLook = CLOUD_LOOK): ReunionFrames {
  const person = buildCharacter(look);
  const together = withLapCat(look, PRINCE_LAP);
  const flicked = withLapCat(look, PRINCE_LAP_FLICK);
  return {
    walk: person.frames.walk.map(mirrored),
    call: person.frames.call.map(mirrored),
    look: person.frames.look,
    idle: person.frames.idle[0]!,
    surprised: person.frames.surprised[0]!,
    run: PRINCE_RUN,
    leap: PRINCE_LEAP,
    dust: DUST_FRAMES,
    together,
    tapped: flicked[1]!,
    heart: HEART,
    palette: { ...DESK_COLOURS, ...person.palette, ...DUST_COLOURS },
  };
}
