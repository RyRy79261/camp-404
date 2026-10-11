// Camp pets' words and paths (owner, 2026-10-09; mock-up option A). A plain
// module, so the client form, the upload route and the page share them.
// Never say what "in" means or where a pet goes.

export const PETS_PATH = "/pets";

/** The photos together stay under this: what one request may carry. */
export const PET_PHOTOS_MAX_BYTES = 4 * 1024 * 1024;

/** The square each photo is cut to in the browser, in pixels. */
export const PET_PHOTO_EDGE = 1024;

export const PET_SENT = "Sent. We'll take it from here.";
export const PET_WAITING_NOTE =
  "Sent. We'll take it from here. You'll get a hint when it's in.";
export const PET_NEEDS_FRONT = "Add a photo from the front.";
export const PET_NEEDS_SIDE = "Add a photo from the side.";
export const PET_PHOTO_TYPES = "Photos must be JPG, PNG or WebP pictures.";
export const PET_NO_PICTURE = "Pick a picture for it.";
