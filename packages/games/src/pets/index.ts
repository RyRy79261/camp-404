// @camp404/games/pets: the pictures of the camp's pets that are in, by the
// key the app stores on each pet, and a server-drawn SVG of one. Props-driven,
// no app content. Never say in the UI what a pet does or where it goes.

export {
  PET_MODULE_KEYS,
  PET_PORTRAITS,
  isPetModuleKey,
  petPortraitRects,
  trimSprite,
  type PetModuleKey,
  type PetPortrait as PetPortraitArt,
  type PortraitRect,
} from "./portraits";
export { PetPortrait, type PetPortraitProps } from "./pet-portrait";
