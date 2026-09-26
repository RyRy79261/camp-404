import type { ReactNode } from "react";
import { LineIcon, type IconKey } from "./line-icons";
import { PixelIcon, teamPixelIcon } from "./pixel-icons";

// A picture for each program, by the icon key the manifest sends (never by
// anything that says who may open it): the approved prototype's line art for
// programs and folders, Join's pixel art for a team's own page. A drawing is
// a function of the classes its place asks for (size, colour, glow), the
// shape @camp404/os's icon components take.

export type Drawing = (className: string) => ReactNode;

/** The manifest's icon keys (and child program ids), to the line drawings. */
const LINE: Readonly<Record<string, IconKey>> = {
  inbox: "inbox",
  "my-forms": "myforms",
  account: "account",
  invites: "keygen",
  "my-lift": "lift",
  tasks: "tasks",
  calendar: "calendar",
  roster: "roster",
  meetings: "minutes",
  meeting: "minutes",
  "new-meeting": "minutes",
  "edit-meeting": "minutes",
  "family-tree": "lineage",
  power: "power",
  recipes: "cookbook",
  recipe: "cookbook",
  "new-recipe": "cookbook",
  "edit-recipe": "cookbook",
  "recipe-version": "cookbook",
  "recipe-source": "cookbook",
  "meal-plan": "mealplan",
  "recipe-review": "review",
  questionnaires: "forms",
  "edit-questionnaire": "forms",
  "preview-questionnaire": "forms",
  "send-questionnaire": "forms",
  results: "forms",
  "respondent-answers": "forms",
  announcements: "broadcast",
  announcement: "broadcast",
  "new-event": "newevent",
  overview: "campstat",
  payments: "ledger",
  "camp-settings": "settings",
  "join-site": "joinsite",
  audit: "audit",
  system: "sysmon",
  form: "myforms",
  "form-answers": "myforms",
  questionnaire: "myforms",
  terminal: "terminal",
  inkblot: "cat",
  folder: "folder",
  "member-folder": "folder",
  kitchen: "folder",
  team: "folder",
};

function line(key: IconKey): Drawing {
  return function LineDrawing(className: string) {
    return <LineIcon name={key} className={className} />;
  };
}

/** A team's own drawing: Join's pixel art. */
export function teamIcon(team: string): Drawing {
  const icon = teamPixelIcon(team);
  return function TeamDrawing(className: string) {
    return <PixelIcon icon={icon} className={className} />;
  };
}

/** The picture for a manifest program: a team page's own, else its icon key's. */
export function programIcon(program: { id: string; icon: string }): Drawing {
  if (program.id.startsWith("team:")) {
    return teamIcon(program.id.slice("team:".length));
  }
  return iconFor(program.icon);
}

/** The picture for an icon key alone (a folder, or a child program by its id). */
export function iconFor(key: string): Drawing {
  return line(LINE[key] ?? "folder");
}

/** A folder, shut or open (its window is on the desktop). */
export function folderIcon(open = false): Drawing {
  return line(open ? "folder-open" : "folder");
}
