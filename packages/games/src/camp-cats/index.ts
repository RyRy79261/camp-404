// @camp404/games/camp-cats: two more of the camp's real cats, Moda (an
// orange tabby who scratches things) and Nipster (a tortoiseshell who sits
// and looks sassy), who turn up on the desktop under a window left open for
// 1.5 minutes, and eat when fed (at most every six hours, kept in the
// browser). Props-driven, no app content. Its classes are scanned through
// @camp404/games/cats/styles.css. Easter eggs: never name them in the UI.
// The story and its choices: camp-cats.md.

export { CampCats, type CampCatsProps } from "./camp-cats";
export {
  BOWL_EMPTY,
  BOWL_FULL,
  CAMP_CATS_COLOURS,
  CELL_H,
  CELL_W,
  MODA_FRAMES,
  NIPSTER_FRAMES,
} from "./art";
export {
  FEED_COOLDOWN_MS,
  FEED_STORAGE_KEY,
  mayFeed,
  recordFeed,
  type FeedStorage,
} from "./feed-limit";
export { DWELL_MS, type Rect, type WindowBox } from "./scene";
