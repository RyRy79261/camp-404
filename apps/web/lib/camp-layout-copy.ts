// The camp layout's words and addresses (#271). A plain module, so the
// "use server" actions file exports only async functions (AGENTS.md).

/** The layout program's page. */
export const LAYOUT_PATH = "/camp-layout";

/** Where a neighbour link opens: outside the console, no sign-in. */
export const NEIGHBOUR_PATH = "/neighbours";

/** A neighbour link's path for a token. */
export function neighbourPath(token: string): string {
  return `${NEIGHBOUR_PATH}/${encodeURIComponent(token)}`;
}

/** The one line every disabled edit control on the page points to. */
export const LAYOUT_REFUSAL =
  "Only captains and Structures leads can change the layout. Everyone in camp can see it.";

export const SHARE_REFUSAL =
  "Only captains can share the layout with neighbours.";

export const CHECK_LAYOUT_INPUT = "Check the layout and try again.";
