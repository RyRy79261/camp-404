// The desktop's grid keys for folders, apart from the layout schema so the
// browser's desktop can name them without loading zod and every schema
// (desktop-layout.ts re-exports them for everyone else).

/** The grid key of a camp-wide folder (Teams, Kitchen, Captains). */
export function desktopFolderKey(folderId: string): string {
  return `folder:${folderId}`;
}

/** The grid key of one of the member's team folders ("Kitchen team"). */
export function desktopTeamFolderKey(team: string): string {
  return `team-folder:${team}`;
}
