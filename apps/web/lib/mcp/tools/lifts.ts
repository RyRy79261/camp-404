import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addCarRider,
  listCarRiders,
  listDrivers,
  removeCarRider,
  type AddRiderResult,
} from "@camp404/db/cars";
import type { McpScope } from "../scope";
import { deny, runTool, ToolError, truncateList } from "../tool-utils";

// Lifts over MCP (docs/mcp-tooling-proposal.md phase 8), for THIS YEAR.
// Driver details are captain-read in the field-access list, so the driver
// list is a captain's. A driver sees and changes the riders in their own car;
// a captain any car. The seat limit is the db module's.

const UserId = z.string().uuid();

const REFUSALS: Record<
  Exclude<AddRiderResult, { ok: true }>["reason"],
  string
> = {
  not_a_driver: "That member isn't driving this year.",
  own_car: "A driver can't ride in their own car.",
  not_a_member: "That member isn't an approved camp member.",
  car_full: "That car is full: every seat offered is taken.",
  already_in_this_car: "They are already in that car.",
};

/** The car this caller may manage: their own, or any for a captain. */
function carFor(scope: McpScope, driverUserId: string | undefined): string {
  const driver = driverUserId ?? scope.campUserId;
  if (driver === scope.campUserId) {
    if (!scope.isDriver && !scope.isCaptain) {
      deny("You aren't driving this year.");
    }
    return driver;
  }
  if (!scope.isCaptain) deny("Only a captain can manage someone else's car.");
  return driver;
}

export function registerLiftTools(server: McpServer): void {
  server.registerTool(
    "list_drivers",
    {
      title: "List this year's drivers",
      description:
        "Captain only. Everyone driving this year, with vehicle, seats offered, departure city, times and how many riders they have.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_drivers",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          if (!scope.isCaptain) deny("Only a captain can see the drivers.");
          return truncateList(await listDrivers());
        },
      }),
  );

  server.registerTool(
    "list_car_riders",
    {
      title: "List the riders in a car",
      description:
        "The riders in a driver's car this year. Leave driverUserId out for your own car. A captain may read any car.",
      inputSchema: { driverUserId: UserId.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_car_riders",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) =>
          await listCarRiders(carFor(scope, args.driverUserId)),
      }),
  );

  server.registerTool(
    "add_car_rider",
    {
      title: "Put a member in a car",
      description:
        "Puts an approved member in a driver's car this year. Leave driverUserId out for your own car; a captain may fill any car. Refused when every seat offered is taken.",
      inputSchema: { memberUserId: UserId, driverUserId: UserId.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "add_car_rider",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const driverUserId = carFor(scope, args.driverUserId);
          const result = await addCarRider({
            driverUserId,
            memberUserId: args.memberUserId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(REFUSALS[result.reason]);
          return { driverUserId, riders: await listCarRiders(driverUserId) };
        },
      }),
  );

  server.registerTool(
    "remove_car_rider",
    {
      title: "Take a member out of a car",
      description:
        "Takes a member out of a driver's car this year. Leave driverUserId out for your own car; a captain may change any car.",
      inputSchema: { memberUserId: UserId, driverUserId: UserId.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_car_rider",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const driverUserId = carFor(scope, args.driverUserId);
          const removed = await removeCarRider({
            driverUserId,
            memberUserId: args.memberUserId,
            actorId: scope.campUserId,
          });
          if (!removed) throw new ToolError("They aren't in that car.");
          return { driverUserId, riders: await listCarRiders(driverUserId) };
        },
      }),
  );
}
