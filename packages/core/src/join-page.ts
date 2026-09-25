// Pictures on the join page (#264). A captain uploads them in the editor; they
// are stored private in the camp's Blob store under `join-page/<year>/`, and
// each app that shows the page (the console's preview, the join site) streams
// them from its own `/api/join-image` route. The Markdown keeps that relative
// link, so one stored page reads the same on both hosts.
//
// Only this prefix is served, to anyone: the join page is public, so its
// pictures are too. Every other prefix in the store (members' photos,
// questionnaire pictures) stays behind /api/avatar.

/** The Blob folder every join-page picture lives under. */
export const JOIN_IMAGE_PREFIX = "join-page/";

/** The route, on either app, that streams one join-page picture. */
export const JOIN_IMAGE_ROUTE = "/api/join-image";

/** Where a year's pictures are uploaded. */
export function joinImageFolder(cycle: number): string {
  return `${JOIN_IMAGE_PREFIX}${cycle}`;
}

// A "." or ".." segment, an empty segment, a backslash or an escape could be
// resolved by the blob client into another folder.
const UNSAFE_PATH = /(^|\/)\.{1,2}(\/|$)|\/\/|\\|%/;

/** True for a blob pathname the join-image route may serve. */
export function isJoinImagePathname(pathname: string): boolean {
  return (
    pathname.startsWith(JOIN_IMAGE_PREFIX) &&
    pathname.length > JOIN_IMAGE_PREFIX.length &&
    pathname.length <= 512 &&
    !UNSAFE_PATH.test(pathname) &&
    !/\s/.test(pathname)
  );
}

/** The link the Markdown stores for a stored picture. */
export function joinImageUrl(pathname: string): string {
  return `${JOIN_IMAGE_ROUTE}?pathname=${encodeURIComponent(pathname)}`;
}

/**
 * True when `url` is a link joinImageUrl made. The renderer shows no other
 * picture: a link to any other host would make every visitor's browser call
 * it, and Notion's own picture links expire within the hour anyway.
 */
export function isJoinImageUrl(url: string): boolean {
  const prefix = `${JOIN_IMAGE_ROUTE}?pathname=`;
  const trimmed = url.trim();
  if (!trimmed.startsWith(prefix)) return false;
  const encoded = trimmed.slice(prefix.length);
  let pathname: string;
  try {
    pathname = decodeURIComponent(encoded);
  } catch {
    return false;
  }
  // Exactly the link joinImageUrl makes: no second parameter, no fragment,
  // no other spelling of the same path.
  return (
    encoded === encodeURIComponent(pathname) && isJoinImagePathname(pathname)
  );
}
