import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TRANSPORT_EDITOR } from "@camp404/core";
import { TRAILER_CHANGED, TRAILER_GONE } from "@camp404/db/transport";
import {
  EditTrailerInput,
  SeatsOfferedInput,
  TowInput,
  TrailerInput,
} from "@camp404/types";
import {
  addTrailer,
  getTransportBoard,
  liftRequestsFor,
  listLiftRequests,
  listUnseated,
  setSeatsOffered,
  setTrailerTow,
  updateTrailer,
  type TrailerRow,
} from "../../transport";
import { CHECK_FORM, TRANSPORT_PATH } from "../../transport-copy";
import { siteUrl } from "../capabilities";
import { scopeActor } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The rest of the Transport page (#270) over MCP, through its own functions
// (lib/transport.ts → @camp404/db/transport), for THIS YEAR.
//
//  - Lift requests read as the page filters them (liftRequestsFor): a captain
//    or a Transport & Logistics lead sees every one and who still needs a
//    seat (built on attendance, which reaches leads and captains only); a
//    driver the ones for their car; anyone their own. Matching a request to a
//    car is add_car_rider (the page's Seat): it spends the request in the
//    same transaction. Answering a request for your car stays on the page.
//  - A car's seats are setSeatsOffered: the car's driver, a captain or a
//    Transport & Logistics lead (canManageCar, re-read inside the write),
//    never below the riders already in it, audited (car.seats_set).
//  - Trailers are a captain's or a Transport & Logistics lead's (the write's
//    TRANSPORT_EDITOR check). A change and the towing car are each a
//    compare-and-set on the version the caller read; update_trailer takes
//    only what changes and fills the rest from the trailer AT that version.
//    No audit row: the site writes none for the trailer list. Removing a
//    trailer stays on the page.

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? CHECK_FORM;
}

function presentTrailer(t: TrailerRow) {
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    version: t.version,
    towedByUserId: t.towedByUserId,
    towedByName: t.towedByName,
  };
}

async function trailerById(trailerId: string): Promise<TrailerRow | null> {
  const { trailers } = await getTransportBoard();
  return trailers.find((t) => t.id === trailerId) ?? null;
}

export function registerTransportMoreTools(server: McpServer): void {
  server.registerTool(
    "list_lift_requests",
    {
      title: "List lift requests",
      description:
        "Open lift requests this year, as the Transport page shows them to you: a captain or Transport & Logistics lead sees every one and `needSeat` (members coming who neither drive nor have a seat); a driver sees those for their car; anyone their own. Each has who asked, the car asked for (or any car) and when. Seat someone with add_car_rider.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_lift_requests",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const canEdit = TRANSPORT_EDITOR.allows(scopeActor(scope));
          const [requests, board, unseated] = await Promise.all([
            listLiftRequests(),
            getTransportBoard(),
            canEdit ? listUnseated() : Promise.resolve(null),
          ]);
          const driverName = new Map(
            board.cars.map((c) => [c.driverUserId, c.driverName]),
          );
          const visible = liftRequestsFor(requests, {
            userId: scope.campUserId,
            canEdit,
          });
          return {
            requests: visible.map((r) => ({
              userId: r.userId,
              name: r.name,
              car: r.driverUserId
                ? {
                    driverUserId: r.driverUserId,
                    driverName: driverName.get(r.driverUserId) ?? null,
                  }
                : null,
              anyCar: r.driverUserId === null,
              askedAt: r.createdAt,
              mine: r.userId === scope.campUserId,
            })),
            needSeat: unseated
              ? unseated.map((u) => ({
                  userId: u.userId,
                  name: u.name,
                  status: u.status,
                }))
              : undefined,
            url: siteUrl(TRANSPORT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_car_seats",
    {
      title: "Set a car's seats",
      description:
        "Sets how many seats a car offers this year, as the Transport page does. Leave driverUserId out for your own car; a captain or a Transport & Logistics lead may set any car's. Never below the riders already in it. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        seatsOffered: z.number().int().min(0),
        driverUserId: z.string().uuid().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_car_seats",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = SeatsOfferedInput.safeParse({
            driverUserId: args.driverUserId ?? scope.campUserId,
            seatsOffered: args.seatsOffered,
          });
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const result = await setSeatsOffered({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          const { cars } = await getTransportBoard();
          const car = cars.find(
            (c) => c.driverUserId === parsed.data.driverUserId,
          );
          return {
            driverUserId: parsed.data.driverUserId,
            driverName: car?.driverName ?? null,
            seatsOffered: parsed.data.seatsOffered,
            seatsTaken: car?.riders.length ?? 0,
            url: siteUrl(TRANSPORT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_trailers",
    {
      title: "List this year's trailers",
      description:
        "The camp's trailers this year, as the Transport page lists them to every member: name, notes, the car towing it (its driver), and the `version` update_trailer and set_trailer_tow need.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_trailers",
        extra,
        argsForAudit: null,
        handler: async () => {
          const { trailers } = await getTransportBoard();
          return {
            trailers: trailers.map(presentTrailer),
            url: siteUrl(TRANSPORT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_trailer",
    {
      title: "Add a trailer",
      description:
        "Adds a trailer to this year's list, as the Transport page's Add trailer does: a `name` and optional `notes`. Pick the car that tows it with set_trailer_tow.",
      inputSchema: z.object({
        name: z.string().max(200),
        notes: z.string().max(2000).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_trailer",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const parsed = TrailerInput.safeParse({
            name: args.name,
            notes: args.notes ?? null,
          });
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const result = await addTrailer({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          const made = await trailerById(result.id);
          return made
            ? { ...presentTrailer(made), url: siteUrl(TRANSPORT_PATH) }
            : { id: result.id, url: siteUrl(TRANSPORT_PATH) };
        },
      }),
  );

  server.registerTool(
    "update_trailer",
    {
      title: "Change a trailer",
      description:
        "Renames a trailer or changes its notes, as the Transport page's Edit does. Give `expectedVersion` from list_trailers and only what changes; null clears the notes. If someone changed it since, nothing changes: read it again.",
      inputSchema: z.object({
        trailerId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        name: z.string().max(200).optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_trailer",
        extra,
        argsForAudit: {
          trailerId: args.trailerId,
          expectedVersion: args.expectedVersion,
          fields: (["name", "notes"] as const).filter(
            (k) => args[k] !== undefined,
          ),
        },
        handler: async ({ scope }) => {
          const current = await trailerById(args.trailerId);
          if (!current) throw new ToolError(TRAILER_GONE);
          // The fields left out are filled from this read, so it must be the
          // version the caller read; the write checks it again.
          if (current.version !== args.expectedVersion) {
            throw new ToolError(TRAILER_CHANGED);
          }
          const parsed = EditTrailerInput.safeParse({
            trailerId: args.trailerId,
            expectedVersion: args.expectedVersion,
            name: args.name ?? current.name,
            notes: args.notes !== undefined ? args.notes : current.notes,
          });
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const result = await updateTrailer({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          const saved = await trailerById(args.trailerId);
          return {
            ...(saved ? presentTrailer(saved) : { id: args.trailerId }),
            // The version THIS change made, never a later one's.
            version: args.expectedVersion + 1,
            url: siteUrl(TRANSPORT_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_trailer_tow",
    {
      title: "Pick the car that tows a trailer",
      description:
        "Says which car tows a trailer (its driver's id, from list_drivers), or none (driverUserId null), as the Transport page does. Give `expectedVersion` from list_trailers. The car must drive this year, be able to tow, and tow no other trailer.",
      inputSchema: z.object({
        trailerId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        driverUserId: z.string().uuid().nullable(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_trailer_tow",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = TowInput.safeParse(args);
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const result = await setTrailerTow({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          const saved = await trailerById(args.trailerId);
          return {
            ...(saved ? presentTrailer(saved) : { id: args.trailerId }),
            version: args.expectedVersion + 1,
            url: siteUrl(TRANSPORT_PATH),
          };
        },
      }),
  );
}
