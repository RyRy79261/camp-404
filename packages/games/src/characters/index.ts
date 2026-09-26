// @camp404/games/characters: the camp's people as 16-bit characters, in the
// cats' pixel scale and palette, and the scenes they play. A person is a
// CharacterLook over one shared body; Cloud is the first. The looks, frames
// and timelines are pure data and pure functions; the scenes (PrinceReunion)
// draw their frames once, as one picture, and step them with one
// requestAnimationFrame clock that stops at the end. Easter eggs: never name
// them in the UI.

export {
  buildCharacter,
  characterPalette,
  resolveTemplate,
  withLapCat,
  HUMAN_LETTERS,
  TEMPLATE_LETTERS,
  type BottomsKind,
  type Character,
  type CharacterLook,
  type HairLength,
  type HairStyle,
  type HumanPose,
  type TopKind,
} from "./human";
export {
  HUMAN_H,
  HUMAN_W,
  HUMAN_TEMPLATES,
  LAP_AT,
  SIT_HANDS,
  SIT_W,
} from "./human-frames";
export { CLOUD_LOOK } from "./cloud";
export {
  PRINCE_LAP,
  PRINCE_LAP_FLICK,
  PRINCE_LEAP,
  PRINCE_RUN,
} from "./prince";
export { DUST_COLOURS, DUST_FRAMES, DUST_H, DUST_W } from "./dust";
export {
  inlaid,
  laidOver,
  lettersOf,
  mirrored,
  outlined,
  padded,
  OUTLINE,
} from "./pixels";
export {
  beatStart,
  reunionFrames,
  DUST_FRAME_MS,
  DUST_ORDER,
  HEART,
  REUNION_BEATS,
  REUNION_CALLS,
  REUNION_LABEL,
  REUNION_MS,
  REUNION_SEEN_KEY,
  REUNION_TAPPED,
  RUN_FRAME_MS,
  WALK_FRAME_MS,
  type ReunionBeat,
  type ReunionFrames,
} from "./prince-reunion";
export {
  advance,
  initialPhase,
  reunionAt,
  reunionGeometry,
  DUST_AT,
  HEART_AT,
  HEART_RISE,
  LEAP_FROM,
  LEAP_HEIGHT,
  LEAP_TO,
  LISTEN_MS,
  MAX_STEP_MS,
  RESTING_SHOT,
  type CloudPose,
  type ReunionGeometry,
  type ReunionPhase,
  type ReunionShot,
} from "./prince-reunion-timeline";
export {
  drawAtlas,
  packAtlas,
  resolveColours,
  type AtlasCell,
  type AtlasLayout,
} from "./sprite-atlas";
export { PrinceReunion, type PrinceReunionProps } from "./prince-reunion-scene";
