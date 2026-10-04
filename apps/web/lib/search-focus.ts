// A search result's deep link (#326, step 2) lands on a list page with the
// one row it named marked: `/tasks?task=<id>`, `/shifts?shift=<id>`,
// `/lounge?offer=<id>`, `/gear?item=<id>`. A plain module, so server pages
// and client islands share the mark's look; <SearchFocus> scrolls it in.

/** The marked row's outline, the OS's primary colour. */
export const SEARCH_FOCUS_CLASS =
  "outline-solid outline-2 -outline-offset-2 outline-primary";

/** The attributes a marked row carries: what <SearchFocus> looks for. */
export function searchFocusProps(on: boolean): {
  "data-search-focus"?: "true";
} {
  return on ? { "data-search-focus": "true" } : {};
}
