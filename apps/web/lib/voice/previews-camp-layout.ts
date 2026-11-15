import { CampLayout } from "@camp404/types";
import {
  getCampLayout,
  listLayoutVersions,
  previousLayoutCycle,
} from "../camp-layout";
import { blocked, shown, type PreviewFn } from "./preview-kit";

// The camp layout's voice previews (#271): each reads this year's plan on the
// server and says what the save leaves there, from the plan sent and the plan
// as it stands.

const PATH = "/camp-layout";
const KEY = "camp-layout";

const pieces = (n: number) => `${n} piece${n === 1 ? "" : "s"}`;

export const CAMP_LAYOUT_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async save_camp_layout(args) {
    const current = await getCampLayout();
    const sent = CampLayout.safeParse(args.layout);
    if (!sent.success) {
      return blocked(
        "Save the camp layout",
        sent.error.issues[0]?.message ?? "Check the layout and try again.",
        args,
        PATH,
      );
    }
    const plot = sent.data.plot;
    const was = current.layout;
    const change = [
      `Plot: ${plot.widthM} × ${plot.depthM} m, north at the ${plot.north}${was && (was.plot.widthM !== plot.widthM || was.plot.depthM !== plot.depthM) ? ` (was ${was.plot.widthM} × ${was.plot.depthM} m)` : ""}`,
      `Pieces: ${sent.data.pieces.length}${was ? ` (was ${was.pieces.length})` : ""}`,
    ];
    if (args.note) change.push(`Note: ${shown(args.note)}`);
    const preview = {
      sentence: `Save the camp layout as version ${current.version + 1}`,
      facts: current.version
        ? `Camp layout · now version ${current.version}, ${pieces(was?.pieces.length ?? 0)}`
        : "Camp layout · the year's first plan",
      change,
      path: PATH,
      args,
      keys: [KEY],
    };
    // The plan sent was built from the version read: never saved over a
    // newer one unseen.
    if (args.expectedVersion !== current.version) {
      return {
        ...preview,
        blocked: "Someone saved the layout since it was read. Read it again.",
      };
    }
    return preview;
  },

  async restore_camp_layout_version(args) {
    const [current, versions] = await Promise.all([
      getCampLayout(),
      listLayoutVersions(),
    ]);
    const old = versions.find((v) => v.number === args.number);
    if (!old) {
      return blocked(
        "Restore a camp layout version",
        "That version isn't in this year's history.",
        args,
        PATH,
      );
    }
    return {
      sentence: `Restore camp layout version ${old.number} as version ${current.version + 1}`,
      facts: `Camp layout · version ${old.number}: ${pieces(old.pieces)}${old.savedByName ? `, by ${old.savedByName}` : ""} · now version ${current.version}`,
      path: PATH,
      args: { number: old.number, expectedVersion: current.version },
      keys: [KEY],
      ...(old.number === current.version
        ? { blocked: "That is the plan already." }
        : {}),
    };
  },

  async copy_last_year_layout() {
    const [current, previous] = await Promise.all([
      getCampLayout(),
      previousLayoutCycle(),
    ]);
    const base = {
      sentence: `Start this year's camp layout from ${previous ?? "last year"}'s`,
      facts: "Camp layout · as version 1",
      path: PATH,
      args: {},
      keys: [KEY],
    };
    if (current.version > 0) {
      return {
        ...base,
        blocked:
          "This year already has a layout, so last year's wasn't copied.",
      };
    }
    if (previous === null) {
      return { ...base, blocked: "There is no earlier year's layout to copy." };
    }
    return base;
  },
};
