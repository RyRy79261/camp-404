// @camp404/games/cats: Camp 404's two cats, Jinn and Prince, hidden about
// the desktop. Props-driven and free of app content: the app decides where
// each one sits and what a secret opens. Their keyframes ship in
// @camp404/games/cats/styles.css. Easter eggs: never name them in the UI.

export {
  DESK_COLOURS,
  JINN_FRAMES,
  JINN_HEAD,
  JINN_SITTING,
  JINN_SLEEPING,
  PRINCE_SLEEPING,
  pixelRuns,
  spriteWidth,
  type PixelRun,
  type Sprite,
} from "./sprites";
export { PixelCat, type PixelCatProps } from "./pixel-cat";
export { useReducedMotion, REDUCED_MOTION_QUERY } from "./reduced-motion";
export {
  ClockCat,
  PRINCE_PETTED,
  petLine,
  type ClockCatProps,
} from "./clock-cat";
export {
  PeekingCat,
  usePeek,
  nextPeekDelay,
  PEEK_MS,
  PEEK_MIN_MS,
  PEEK_MAX_MS,
  type PeekingCatProps,
  type PeekOptions,
} from "./peek";
export {
  useDesktopSecrets,
  feedSecretKey,
  isTypingTarget,
  KONAMI,
  type DesktopSecretsHandlers,
  type Secret,
} from "./secrets";
export {
  PawTrail,
  nextPaw,
  PAW_STRIDE,
  PAW_MAX,
  PAW_MS,
  type Paw,
  type PawTrailProps,
} from "./paw-trail";
