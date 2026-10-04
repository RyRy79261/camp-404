import type { MarkdownLinkTarget } from "@camp404/ui/components/markdown-body";
import { APP_ORIGIN, appChapterUrl } from "./book";

// Where a link in a chapter goes on the public site, and what paper prints
// after it (#250's print: "an outside link prints its short address; a link
// to another chapter prints its name"). Writers link the way the app reads:
// another chapter is /guide/<slug>, any other page of the app is a path.
//
//  - A chapter that is public here goes to its page here.
//  - A chapter that is not public goes to the app, where members read it;
//    the link's own words were published, so naming it reveals nothing.
//  - Any other path goes to the app.
//  - An outside address goes there, in its own tab.

const APP_HOSTS = /^https?:\/\/(?:www\.)?camp-404\.com(?=\/|$)/i;

/** "afrikaburn.org/survival-guide": no scheme, no www, no trailing slash. */
export function shortAddress(href: string): string {
  const bare = href
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^mailto:/i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  return bare.length > 60 ? `${bare.slice(0, 59)}…` : bare;
}

export function linkResolver(
  publicTitles: ReadonlyMap<string, string>,
): (href: string) => MarkdownLinkTarget {
  return (href) => {
    if (href.startsWith("#")) return { href };
    const path = href.replace(APP_HOSTS, "");
    if (path.startsWith("/")) {
      const chapter = /^\/guide\/([a-z0-9-]+)\/?(#.*)?$/.exec(path);
      if (chapter) {
        const title = publicTitles.get(chapter[1]!);
        if (title !== undefined) {
          return {
            href: `/${chapter[1]}${chapter[2] ?? ""}`,
            printChapter: title,
          };
        }
        const url = appChapterUrl(chapter[1]!);
        return { href: url, printUrl: shortAddress(url), external: true };
      }
      const url = `${APP_ORIGIN}${path}`;
      return { href: url, printUrl: shortAddress(url), external: true };
    }
    if (/^mailto:/i.test(href)) return { href, printUrl: shortAddress(href) };
    return { href, printUrl: shortAddress(href), external: true };
  };
}
