import type { ReactNode } from "react";
import { LineIcon, type IconKey } from "./line-icons";
import { PixelIcon, teamPixelIcon } from "@camp404/os/pixel-icons";
import { PROGRAM_DEFINITIONS, type ProgramId } from "@/lib/program-routes";

// A picture for each program, by the icon key the manifest sends (never by
// anything that says who may open it): the approved prototype's line art for
// programs and folders, Join's pixel art for a team's own page. A drawing is
// a function of the classes its place asks for (size, colour, glow), the
// shape @camp404/os's icon components take.

export type Drawing = (className: string) => ReactNode;

/** A drawing key for each program, as its definition names it. */
type DefinedLine = (typeof PROGRAM_DEFINITIONS)[ProgramId]["line"];
// Fails to compile when a definition names a drawing line-icons.tsx lacks.
const definedLine = (key: DefinedLine): IconKey => key;

/**
 * The manifest's icon keys (each program's id) and the folders' keys, to the
 * line drawings.
 */
const LINE: ReadonlyMap<string, IconKey> = new Map<string, IconKey>([
  ...(Object.keys(PROGRAM_DEFINITIONS) as ProgramId[]).map(
    (id) => [id, definedLine(PROGRAM_DEFINITIONS[id].line)] as const,
  ),
  ["folder", "folder"],
  ["member-folder", "folder"],
  ["kitchen", "folder"],
]);

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
  return line(LINE.get(key) ?? "folder");
}

/** A folder, shut or open (its window is on the desktop). */
export function folderIcon(open = false): Drawing {
  return line(open ? "folder-open" : "folder");
}
