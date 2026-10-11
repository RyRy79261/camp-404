// Help wanted's fixed words (owner's pick A, 2026-10-09). A plain module: a
// "use server" file may export only async functions, so the actions and the
// screens share these from here. Pure, so the client board imports it too.

export const HELP_WANTED_PATH = "/help-wanted";

/** What a member who may not run a team's roles is told, by the action. */
export const HELP_WANTED_REFUSAL =
  "Only captains and this team's leads can change its roles.";
export const CHECK_ROLE = "Check the role and try again.";
export const RELOAD = "Reload the page and try again.";

export const MEMBER_DESCRIPTION =
  "Every team's roles for this year and who fills them. Press “I'm keen” on anything you'd like to do; the team's lead or a captain picks.";
export const KEEPER_DESCRIPTION =
  "Every team's roles for this year and who fills them. Pick someone for an open role; people who pressed “I'm keen” are listed first.";

/** The Lead role's note when nobody wrote one. */
export const LEAD_NOTE = "Runs the team this year";

/** "a Shopper" / "an Archivist". */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
}
