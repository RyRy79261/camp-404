import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CampLayout, SaveLayoutInput } from "@camp404/types";
import {
  copyLastYearLayout,
  getCampLayout,
  listLayoutVersions,
  previousLayoutCycle,
  restoreLayoutVersion,
  saveCampLayout,
} from "../../camp-layout";
import { CHECK_LAYOUT_INPUT, LAYOUT_PATH } from "../../camp-layout-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The camp layout (#271) over MCP, through the page's own facade
// (lib/camp-layout.ts → @camp404/db/camp-layout, or the E2E store).
//
//  - get_camp_layout reads what every member reads on the page: the plan (or
//    an earlier version of it), who saved it and when, the saved versions,
//    and whether there is an earlier year to copy. Not the neighbour link:
//    that is a captain's, on the page.
//  - Saving is the editor's Save: the WHOLE plan, checked by the same Zod
//    schema and core check, as a compare-and-set on the version the caller
//    read (a new numbered version; nothing is overwritten). Restoring and
//    copying last year's are the page's own writes. LAYOUT_EDITOR is the
//    gate, and every write re-reads the actor under lock. The plan is team
//    planning data, so no audit row, as on the page.
//  - Sharing with neighbours puts the plan on a public page: website only.

export function registerCampLayoutTools(server: McpServer): void {
  server.registerTool(
    "get_camp_layout",
    {
      title: "Read the camp layout",
      description:
        "This year's site plan as the Camp layout page shows it: `version` (0 when none is saved), the plan (`plot`: size in metres, north, block part, edges; `pieces`: id, kind, label, x, y, w, h from the plot's top-left), its note, who saved it, the last saved versions, and whether last year's can be copied. Pass `version` to read an earlier one.",
      inputSchema: z.object({ version: z.number().int().min(1).optional() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_camp_layout",
        extra,
        argsForAudit: args,
        handler: async () => {
          const [state, latest, versions, previous] = await Promise.all([
            getCampLayout(undefined, args.version),
            args.version ? getCampLayout() : Promise.resolve(null),
            listLayoutVersions(),
            previousLayoutCycle(),
          ]);
          const latestVersion = latest?.version ?? state.version;
          return {
            version: state.version,
            latestVersion,
            layout: state.layout,
            note: state.note,
            savedAt: state.savedAt,
            savedBy: state.savedByName,
            versions: versions.map((v) => ({
              number: v.number,
              note: v.note,
              savedAt: v.savedAt,
              savedBy: v.savedByName,
              pieces: v.pieces,
            })),
            canCopyLastYear: latestVersion === 0 && previous !== null,
            url: siteUrl(LAYOUT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "save_camp_layout",
    {
      title: "Save the camp layout",
      description:
        "Saves the WHOLE site plan as a new version, as the editor's Save does: read it with get_camp_layout, change it, send all of it back with the `expectedVersion` you read (0 when none is saved) and an optional `note`. Lengths are whole or half metres; every piece must sit on the plot. Refused if someone saved since you read it.",
      inputSchema: z.object({
        layout: CampLayout,
        expectedVersion: z.number().int().min(0),
        note: z.string().max(120).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_camp_layout",
        extra,
        argsForAudit: {
          expectedVersion: args.expectedVersion,
          pieces: args.layout.pieces.length,
        },
        handler: async ({ scope }) => {
          const parsed = SaveLayoutInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? CHECK_LAYOUT_INPUT,
            );
          }
          const result = await saveCampLayout({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { version: result.version, url: siteUrl(LAYOUT_PATH) };
        },
      }),
  );

  server.registerTool(
    "restore_camp_layout_version",
    {
      title: "Restore a camp layout version",
      description:
        "Saves an earlier version of this year's plan again as the newest, as the history's Restore does. Give its `number` and the `expectedVersion` you read (get_camp_layout's latestVersion). Nothing is lost: the plan it replaces stays in the history. Refused if someone saved since you read it.",
      inputSchema: z.object({
        number: z.number().int().min(1),
        expectedVersion: z.number().int().min(0),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "restore_camp_layout_version",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await restoreLayoutVersion({
            ...args,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            version: result.version,
            restored: args.number,
            url: siteUrl(LAYOUT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "copy_last_year_layout",
    {
      title: "Copy last year's camp layout",
      description:
        "Starts this year's site plan from the last year that had one, as the page's “Copy last year's layout” does. Only while this year has no plan, so it never replaces one.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "copy_last_year_layout",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const result = await copyLastYearLayout({
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            version: result.version,
            fromYear: result.fromCycle,
            url: siteUrl(LAYOUT_PATH),
          };
        },
      }),
  );
}
