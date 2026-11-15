import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { RENTAL_ITEM_MISSING, type RentalItem } from "@camp404/db/rental";
import {
  RENTAL_SOURCES,
  RentalItemInput,
  TENT_LABEL_MAX,
  TentLabelInput,
} from "@camp404/types";
import { ledgerCycle } from "../../payments";
import {
  addRentalItem,
  editRentalItem,
  getRentalOverview,
  listRentalItems,
  setTentLabel,
} from "../../rental";
import { RENTAL_CATALOGUE_PATH, RENTAL_PATH } from "../../rental-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The captains' gear rental catalogue and tent labels over MCP (#241), each
// the page's own write (lib/rental.ts, through twin()), with the signed-in
// person's id alone. Every write re-checks the actor (RENTAL_MANAGER) inside
// its own transaction and writes its audit row there (rental.item_added,
// rental.item_changed, rental.tent_labelled), as on the page.
//
//  - The catalogue's edit dialog sends the whole item and the write has no
//    version. The tool takes only what changes and fills the rest from the
//    item as it stands, and only when the item still reads as the caller read
//    it: the read gives each item a `fingerprint` of its fields, and an edit
//    naming another is refused. (That check is before the write, not inside
//    its transaction: two captains saving the same item in the same instant
//    is the page's own race too.)
//  - A tent's label is named with the label the caller read (`from`), checked
//    the same way.
//  - Archiving an item, "Ask everyone", filling in, confirming and reopening an
//    order (a charge on a member's dues) stay on the page.

const firstIssue = (error: z.ZodError, fallback: string) =>
  error.issues[0]?.message ?? fallback;

const CHECK = "Check the form and try again.";
export const RENTAL_ITEM_CHANGED =
  "Someone changed this item since you read it. Read the catalogue again.";
export const TENT_LABEL_CHANGED =
  "Someone changed this tent's label since you read it. Read the catalogue again.";
export const TENT_NOT_FOUND =
  "That tent isn't on a confirmed order. Read the catalogue again.";

/** The fields the catalogue's dialog sends. */
const ITEM_KEYS = [
  "name",
  "isTent",
  "sleeps",
  "campPriceCents",
  "campStockCount",
  "supplierPriceCents",
  "reserveCount",
  "reserveSource",
] as const;

/** A short hash of an item's editable fields: what an edit names. */
export function rentalItemFingerprint(item: RentalItem): string {
  const fields = ITEM_KEYS.map((k) => item[k]);
  return createHash("sha256")
    .update(JSON.stringify(fields))
    .digest("hex")
    .slice(0, 12);
}

const itemFields = {
  name: z.string().min(1).max(60),
  isTent: z.boolean(),
  sleeps: z.number().int().min(1),
  campPriceCents: z.number().int().min(0).nullable(),
  campStockCount: z.number().int().min(1).nullable(),
  supplierPriceCents: z.number().int().min(0).nullable(),
  reserveCount: z.number().int().min(0),
  reserveSource: z.enum(RENTAL_SOURCES),
};

export function registerGearRentalTools(server: McpServer): void {
  server.registerTool(
    "get_gear_rental_catalogue",
    {
      title: "Read the gear rental catalogue",
      description:
        "This year's gear rental catalogue as the captains' Catalogue page lists it: each item's prices (rand cents), camp stock, reserve and `fingerprint` (what update_rental_item takes); and `tents`: the camp tents on confirmed orders, whose they are, who shares them and their `label` (`lineId` for set_tent_label).",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_gear_rental_catalogue",
        extra,
        argsForAudit: null,
        handler: async () => {
          const cycle = await ledgerCycle();
          const [items, overview] = await Promise.all([
            listRentalItems(cycle),
            getRentalOverview(cycle),
          ]);
          return {
            items: items.map((i) => ({
              id: i.id,
              name: i.name,
              isTent: i.isTent,
              sleeps: i.sleeps,
              campPriceCents: i.campPriceCents,
              campStockCount: i.campStockCount,
              supplierPriceCents: i.supplierPriceCents,
              reserveCount: i.reserveCount,
              reserveSource: i.reserveSource,
              fingerprint: rentalItemFingerprint(i),
            })),
            tents: overview.tents.map((t) => ({
              lineId: t.lineId,
              tent: t.itemName,
              sleeps: t.sleeps,
              people: t.people,
              label: t.tentLabel,
              owner: t.ownerName,
              sharers: t.sharers,
            })),
            url: siteUrl(RENTAL_CATALOGUE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_rental_item",
    {
      title: "Add a gear rental item",
      description:
        "Adds an item to this year's rental catalogue. Prices are rand cents. `campPriceCents` and `campStockCount` go together (both null: the camp has none); give a `supplierPriceCents` or camp stock. Only a tent sleeps more than one. `reserveCount` spares come from `reserveSource` (camp or supplier).",
      inputSchema: z.object(itemFields),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_rental_item",
        extra,
        argsForAudit: { name: args.name, isTent: args.isTent },
        handler: async ({ scope }) => {
          const parsed = RentalItemInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK));
          }
          const result = await addRentalItem({
            cycle: await ledgerCycle(),
            item: parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            name: parsed.data.name,
            url: siteUrl(RENTAL_CATALOGUE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "update_rental_item",
    {
      title: "Change a gear rental item",
      description:
        "Changes a rental item as the Catalogue's edit does. Give `itemId`, the `fingerprint` you read (get_gear_rental_catalogue) and only the fields that change (prices in rand cents; null clears camp stock or the supplier). Refused if the item changed since you read it. Confirmed orders keep their price.",
      inputSchema: z.object({
        itemId: z.string(),
        fingerprint: z.string(),
        name: itemFields.name.optional(),
        isTent: itemFields.isTent.optional(),
        sleeps: itemFields.sleeps.optional(),
        campPriceCents: itemFields.campPriceCents.optional(),
        campStockCount: itemFields.campStockCount.optional(),
        supplierPriceCents: itemFields.supplierPriceCents.optional(),
        reserveCount: itemFields.reserveCount.optional(),
        reserveSource: itemFields.reserveSource.optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_rental_item",
        extra,
        argsForAudit: {
          itemId: args.itemId,
          fields: ITEM_KEYS.filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          const item = (await listRentalItems(await ledgerCycle())).find(
            (i) => i.id === args.itemId,
          );
          if (!item) throw new ToolError(RENTAL_ITEM_MISSING);
          if (rentalItemFingerprint(item) !== args.fingerprint) {
            throw new ToolError(RENTAL_ITEM_CHANGED);
          }
          const whole: Record<string, unknown> = {};
          for (const key of ITEM_KEYS) {
            whole[key] = args[key] !== undefined ? args[key] : item[key];
          }
          const parsed = RentalItemInput.safeParse(whole);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK));
          }
          const result = await editRentalItem({
            itemId: args.itemId,
            item: parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: args.itemId,
            name: parsed.data.name,
            url: siteUrl(RENTAL_CATALOGUE_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_tent_label",
    {
      title: "Label a camp tent",
      description: `Labels a camp tent on a confirmed order ("T3"), up to ${TENT_LABEL_MAX} characters, or takes the label off with "" . Give its \`lineId\` and \`from\`: the label you read (null for none) from get_gear_rental_catalogue.`,
      inputSchema: z.object({
        lineId: z.string(),
        label: z.string().max(TENT_LABEL_MAX),
        from: z.string().nullable(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_tent_label",
        extra,
        argsForAudit: { lineId: args.lineId },
        handler: async ({ scope }) => {
          const parsed = TentLabelInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK));
          }
          const tent = (
            await getRentalOverview(await ledgerCycle())
          ).tents.find((t) => t.lineId === parsed.data.lineId);
          if (!tent) throw new ToolError(TENT_NOT_FOUND);
          if ((tent.tentLabel ?? null) !== (args.from || null)) {
            throw new ToolError(TENT_LABEL_CHANGED);
          }
          const result = await setTentLabel({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            lineId: parsed.data.lineId,
            label: parsed.data.label,
            owner: tent.ownerName,
            url: siteUrl(RENTAL_PATH),
          };
        },
      }),
  );
}
