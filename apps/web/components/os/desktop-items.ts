import {
  EMPTY_LAYOUT,
  type DefaultSpec,
  type DesktopLayout,
} from "@camp404/os";
import { desktopFolderKey, desktopTeamFolderKey } from "@camp404/types";
import type {
  ClientFolder,
  ClientProgram,
  ClientTeamFolder,
  ProgramGroup,
  ProgramManifest,
} from "@/lib/programs";

// What the desktop draws, worked out from the member's manifest and their
// saved layout. Pure, so the rules are tested without a browser. The
// manifest is built on the server and holds only what this member may open;
// nothing here widens it (a shortcut or a member folder names programs from
// it, and loses them when they leave it).
//
// Types only from lib/programs.ts: that module is `server-only`, and a type
// import is erased before the browser sees it.

/** One icon on the desktop. `key` is its key in the stored layout. */
export type DesktopEntry =
  | { kind: "program"; key: string; program: ClientProgram }
  | { kind: "folder"; key: string; folder: ClientFolder }
  | { kind: "team-folder"; key: string; folder: ClientTeamFolder }
  | { kind: "shortcut"; key: string; program: ClientProgram }
  | {
      kind: "member-folder";
      key: string;
      name: string;
      programs: ClientProgram[];
    };

const GROUP_ORDER: readonly ProgramGroup[] = ["me", "camp", "captains"];
const GROUP_LABELS: Record<ProgramGroup, string> = {
  me: "Me",
  camp: "Camp",
  captains: "Captains",
};

/** Every program the member has, by id: the desktop's, each folder's, each team folder's. */
export function programIndex(
  manifest: ProgramManifest,
): Map<string, ClientProgram> {
  const index = new Map<string, ClientProgram>();
  for (const p of manifest.programs) index.set(p.id, p);
  for (const f of manifest.folders) {
    for (const p of f.programs) if (!index.has(p.id)) index.set(p.id, p);
  }
  for (const f of manifest.teamFolders) {
    for (const p of f.programs) if (!index.has(p.id)) index.set(p.id, p);
  }
  return index;
}

/**
 * The icons on the desktop, in the manifest's order: its programs and
 * folders, the member's team folders, then the member's own shortcuts and
 * folders. A shortcut to a program the member no longer has is not drawn,
 * and a member folder keeps only the programs they still have.
 */
export function desktopEntries(
  manifest: ProgramManifest,
  layout: DesktopLayout,
): DesktopEntry[] {
  const index = programIndex(manifest);
  const programs = new Map(manifest.programs.map((p) => [p.id, p]));
  const folders = new Map(manifest.folders.map((f) => [f.id, f]));
  const out: DesktopEntry[] = [];
  for (const item of manifest.desktop) {
    if (item.kind === "program") {
      const program = programs.get(item.id);
      if (program) out.push({ kind: "program", key: program.id, program });
    } else {
      const folder = folders.get(item.id);
      if (folder) {
        out.push({ kind: "folder", key: desktopFolderKey(folder.id), folder });
      }
    }
  }
  for (const folder of manifest.teamFolders) {
    out.push({
      kind: "team-folder",
      key: desktopTeamFolderKey(folder.team),
      folder,
    });
  }
  for (const item of layout.items) {
    if (item.kind === "shortcut") {
      const program = index.get(item.target);
      if (program) out.push({ kind: "shortcut", key: item.id, program });
    } else {
      out.push({
        kind: "member-folder",
        key: item.id,
        name: item.name,
        programs: item.items
          .map((id) => index.get(id))
          .filter((p): p is ClientProgram => p !== undefined),
      });
    }
  }
  return out;
}

/**
 * The default layout (visual-language doc 4.4): one column per group from
 * the left (Me, Camp, Captains), the team folders down the right, led first
 * (the manifest's order), and the member's own items in the first free cells.
 */
export function desktopSpec(
  manifest: ProgramManifest,
  layout: DesktopLayout,
): DefaultSpec {
  const groupOf = new Map<string, ProgramGroup>();
  for (const p of manifest.programs) groupOf.set(p.id, p.group);
  for (const f of manifest.folders)
    groupOf.set(desktopFolderKey(f.id), f.group);
  const keys = manifest.desktop.map((item) =>
    item.kind === "program" ? item.id : desktopFolderKey(item.id),
  );
  return {
    columns: GROUP_ORDER.map((group) =>
      keys.filter((key) => groupOf.get(key) === group),
    ),
    right: manifest.teamFolders.map((f) => desktopTeamFolderKey(f.team)),
    extra: layout.items.map((item) => item.id),
  };
}

/**
 * Every program id a window may hold, for `pruneTo` on the window stack: the
 * programs the member has an icon for, the child programs they may open
 * (a meeting, Results, Edit recipe; each at its own bar), and the folders a
 * folder window shows. A window for anything else closes when the manifest
 * changes (a demotion, a move off a team).
 */
export function allowedWindowPrograms(
  manifest: ProgramManifest,
  layout: DesktopLayout,
): Set<string> {
  const allowed = new Set<string>(programIndex(manifest).keys());
  for (const id of manifest.allowedChildren) allowed.add(id);
  for (const f of manifest.folders) allowed.add(desktopFolderKey(f.id));
  for (const f of manifest.teamFolders) {
    allowed.add(desktopTeamFolderKey(f.team));
  }
  for (const item of layout.items) {
    if (item.kind === "folder") allowed.add(item.id);
  }
  return allowed;
}

/**
 * The id a page window is pruned by. A team's page is one program per team
 * in the manifest (`team:kitchen`), which is also its window's key; every
 * other page is pruned by its program id.
 */
export function windowProgram(programId: string, instanceKey: string): string {
  return programId === "team" ? instanceKey : programId;
}

/** The member folders a program can be added to, by id and name. */
export function memberFolders(
  layout: DesktopLayout,
): { id: string; name: string; items: string[] }[] {
  return layout.items.flatMap((item) =>
    item.kind === "folder"
      ? [{ id: item.id, name: item.name, items: item.items }]
      : [],
  );
}

/**
 * The phone's home screen (design doc, section 5): the desktop's groups in
 * the desktop's default order (Me, Camp, Captains, the Terminal where the
 * desktop puts it), then My teams, by icon key. Never the member's own
 * shortcuts or folders: those are desktop only. Empty groups are left out.
 */
export function homeScreenGroups(
  manifest: ProgramManifest,
): { key: string; label: string; keys: readonly string[] }[] {
  const spec = desktopSpec(manifest, EMPTY_LAYOUT);
  const labels = new Map(manifest.startMenu.map((s) => [s.group, s.label]));
  const groups: { key: string; label: string; keys: readonly string[] }[] =
    GROUP_ORDER.map((group, i) => ({
      key: group,
      label: labels.get(group) ?? GROUP_LABELS[group],
      keys: spec.columns[i] ?? [],
    }));
  groups.push({ key: "my-teams", label: "My teams", keys: spec.right ?? [] });
  return groups.filter((g) => g.keys.length > 0);
}
