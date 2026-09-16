// A redirect target taken from a query string (?next=, ?callbackURL=) must stay
// on this app, or a link to a Camp 404 page can send a signed-in member to a
// look-alike sign-in page elsewhere.
//
// Checking for a leading "/" and no "//" is not enough. Browsers treat a
// backslash like a slash and drop tabs and newlines inside a URL, so
// "/\evil.example" and "/<TAB>/evil.example" both leave the app. So the value is
// resolved the way a browser resolves it (the WHATWG URL parser) against a
// fixed origin, and kept only if it stays on that origin.

const BASE = "https://camp404.invalid";

/** The path, query and hash of `raw` if it is a path on this app, else "/". */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/";
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
