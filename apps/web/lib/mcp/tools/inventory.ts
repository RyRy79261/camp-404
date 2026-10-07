import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canEditInventory } from "@camp404/core";
import { NOT_AN_INVENTORY_EDITOR } from "@camp404/db/inventory";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
  InventoryItemInput,
  InventoryProposalInput,
} from "@camp404/types";
import { getTeamsConfig, teamLabelMap } from "../../camp-config";
import {
  addInventoryItem,
  listInventoryItems,
  listPendingProposals,
  proposeInventoryChange,
} from "../../inventory";
import {
  INVENTORY_PATH,
  inventoryItemPath,
  maintenanceNote,
  whereText,
} from "../../inventory-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError, truncateList } from "../tool-utils";

// The camp's gear over MCP (#246, for the Notion import #239), on the
// Inventory page's rules and through its own functions (@/lib/inventory):
//
//  - Every approved member reads the gear as the page lists it, and the
//    suggested changes waiting for THEIR review (a captain, or a lead of the
//    item's team: canEditInventory, the page's own filter).
//  - Adding an item is addInventoryItem, the page's Add dialog's write. It
//    re-reads the actor's rank and led teams inside its own transaction
//    (lockInventoryEditor) and refuses a team they may not edit; the change
//    log row ("Added", by them) is written in the same transaction, as on the
//    page. Nothing here passes a rank or a team list.
//  - Any member may suggest a change to an item (proposeInventoryChange), as
//    on the item's page; a lead of its team or a captain decides on the page.
//  - Editing, archiving, deciding a suggestion, lending, needs and bookings
//    stay on the page for now.

const firstIssue = (error: z.ZodError, fallback: string) =>
  error.issues[0]?.message ?? fallback;

export function registerInventoryTools(server: McpServer): void {
  server.registerTool(
    "list_inventory_items",
    {
      title: "List the camp's gear",
      description:
        "The camp's gear as the Inventory page lists it, with the team, the count, the condition, where it is and any maintenance due. `toReview` holds the changes members suggested that you may approve on the page (a captain, or a lead of the item's team). Filter with `q` (name, details or spot), `team`, `location` or `condition`. `version` is what the page's edit would name.",
      inputSchema: z.object({
        q: z.string().max(80).optional(),
        team: z.string().max(80).optional(),
        location: z.enum(INVENTORY_LOCATIONS).optional(),
        condition: z.enum(INVENTORY_CONDITIONS).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_inventory_items",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [items, pending, config] = await Promise.all([
            listInventoryItems(),
            listPendingProposals(),
            getTeamsConfig(),
          ]);
          const labels = teamLabelMap(config);
          const canEdit = (team: string) =>
            canEditInventory(scope.viewerRank, scope.leadTeams, team);
          const q = args.q?.trim().toLowerCase();
          const now = new Date();
          const shown = items.filter((item) => {
            if (q) {
              const hay =
                `${item.name} ${item.details ?? ""} ${item.storageLocation ?? ""}`.toLowerCase();
              if (!hay.includes(q)) return false;
            }
            if (args.team && item.team !== args.team) return false;
            if (args.location && item.location !== args.location) return false;
            if (args.condition && item.condition !== args.condition)
              return false;
            return true;
          });
          const { rows, truncated, total } = truncateList(
            shown.map((item) => ({
              id: item.id,
              name: item.name,
              details: item.details,
              team: item.team,
              teamLabel: labels[item.team] ?? item.team,
              category: item.category,
              quantity: item.quantity,
              unit: item.unit,
              condition: item.condition,
              where: whereText(item),
              location: item.location,
              storageLocation: item.storageLocation,
              weightKg: item.weightKg,
              wattsEach: item.wattsEach,
              bookableCount: item.bookableCount,
              maintenance: maintenanceNote(item, now)?.text ?? null,
              version: item.version,
              youMayEdit: canEdit(item.team),
              url: siteUrl(inventoryItemPath(item.id)),
            })),
          );
          return {
            rows,
            truncated,
            total,
            toReview: pending
              .filter((p) => canEdit(p.team))
              .map((p) => ({
                id: p.id,
                itemId: p.itemId,
                itemName: p.itemName,
                team: p.team,
                quantity: p.quantity,
                condition: p.condition,
                location: p.location,
                storageLocation: p.storageLocation,
                maintenanceDone: p.maintenancePerformedAt !== null,
                note: p.note,
                suggestedBy: p.proposedByName,
                suggestedAt: p.createdAt,
              })),
            reviewOn: siteUrl(INVENTORY_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_inventory_item",
    {
      title: "Add an item of gear",
      description: `Adds an item to the camp's gear, for a team you may edit: a captain any team, a team lead their own. The Inventory page's own write: it checks you again and logs the item's history ("Added", by you). \`location\` "custodian_home" needs \`custodianUserId\` (an approved member); \`requiresMaintenance\` needs \`maintenanceIntervalDays\`. Categories: ${INVENTORY_CATEGORIES.join(", ")}.`,
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        team: z.string().max(80),
        category: z.enum(INVENTORY_CATEGORIES),
        condition: z.enum(INVENTORY_CONDITIONS).default("good"),
        quantity: z.number().int().min(0),
        unit: z.string().max(30).nullable().optional(),
        details: z.string().max(500).nullable().optional(),
        weightKg: z.number().min(0).nullable().optional(),
        wattsEach: z.number().positive().nullable().optional(),
        location: z.enum(INVENTORY_LOCATIONS),
        custodianUserId: z.string().uuid().nullable().optional(),
        storageLocation: z.string().max(80).nullable().optional(),
        requiresMaintenance: z.boolean().default(false),
        maintenanceIntervalDays: z.number().int().min(1).nullable().optional(),
        bookableCount: z.number().int().min(1).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_inventory_item",
        extra,
        argsForAudit: { team: args.team, category: args.category },
        handler: async ({ scope }) => {
          const parsed = InventoryItemInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              firstIssue(parsed.error, "That item is not valid."),
            );
          }
          const result = await addInventoryItem({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) {
            throw new ToolError(
              result.error === NOT_AN_INVENTORY_EDITOR
                ? `${result.error} On the website: ${siteUrl(INVENTORY_PATH)}`
                : result.error,
            );
          }
          return {
            id: result.id,
            name: parsed.data.name,
            team: parsed.data.team,
            url: siteUrl(inventoryItemPath(result.id)),
          };
        },
      }),
  );

  server.registerTool(
    "propose_inventory_change",
    {
      title: "Suggest a change to an item",
      description:
        'Suggests a new count, condition or place for an item (after a count, say), as the item\'s page does. A lead of its team or a captain approves or turns it down on the page; nothing changes until then. Give the whole picture: `quantity`, `condition` and `location` (with `custodianUserId` for "custodian_home"); `maintenanceDone` says maintenance was just done.',
      inputSchema: z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().min(0),
        condition: z.enum(INVENTORY_CONDITIONS),
        location: z.enum(INVENTORY_LOCATIONS),
        custodianUserId: z.string().uuid().nullable().optional(),
        storageLocation: z.string().max(80).nullable().optional(),
        maintenanceDone: z.boolean().default(false),
        note: z.string().max(300).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "propose_inventory_change",
        extra,
        argsForAudit: { itemId: args.itemId },
        handler: async ({ scope }) => {
          const parsed = InventoryProposalInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              firstIssue(parsed.error, "That change is not valid."),
            );
          }
          const result = await proposeInventoryChange({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            status: "pending",
            url: siteUrl(inventoryItemPath(parsed.data.itemId)),
          };
        },
      }),
  );
}
