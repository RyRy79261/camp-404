import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMyLift } from "../../lifts";
import {
  addRider,
  getTransportBoard,
  removeRider,
  type TransportCar,
} from "../../transport";
import { notFound, runTool, ToolError, truncateList } from "../tool-utils";

// Transport over MCP, on the Transport page's rules (#270), for THIS YEAR.
//
//  - Every approved member reads the cars as the page shows them: the driver,
//    the car, where it leaves from, the seats and who rides (no phone,
//    registration or travel dates of anyone else's car).
//  - Seats are written by the same @camp404/db/transport functions the page
//    calls. Each re-reads the actor's rank and led teams inside its own
//    transaction and asks @camp404/core (canManageCar, canRemoveRider): the
//    car's driver, a captain or a Transport & Logistics lead may seat someone;
//    a rider may also leave. They refuse a second seat (ALREADY_SEATED), a
//    driver as a rider (IS_DRIVING) and a full car, in the page's own words.
//    Nothing here passes a rank or a team list.
//  - Lift requests, trailers and the car message stay on the page for now.

const UserId = z.string().uuid();

function presentCar(car: TransportCar) {
  return {
    driverUserId: car.driverUserId,
    driverName: car.driverName,
    vehicle: car.vehicle,
    departureCity: car.departureCity,
    seatsOffered: car.seatsOffered,
    seatsTaken: car.riders.length,
    canTow: car.canTow,
    riders: car.riders,
    trailer: car.trailer,
  };
}

async function carOf(driverUserId: string) {
  const { cars } = await getTransportBoard();
  const car = cars.find((c) => c.driverUserId === driverUserId);
  if (!car) notFound("That person isn't driving this year.");
  return presentCar(car);
}

/** The car a member rides in this year, from the board, or null. */
async function carRiddenBy(memberUserId: string) {
  const { cars } = await getTransportBoard();
  return (
    cars.find((c) => c.riders.some((r) => r.userId === memberUserId)) ?? null
  );
}

export function registerLiftTools(server: McpServer): void {
  server.registerTool(
    "list_drivers",
    {
      title: "List this year's cars",
      description:
        "Every car driving this year, as the Transport page shows it to every member: driver, car, where it leaves from, seats offered and taken, who rides, and its trailer. No phone numbers, registrations or travel dates.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_drivers",
        extra,
        argsForAudit: null,
        handler: async () => {
          const { cars } = await getTransportBoard();
          return truncateList(cars.map(presentCar));
        },
      }),
  );

  server.registerTool(
    "list_car_riders",
    {
      title: "List the riders in a car",
      description:
        "Who rides in one car this year, as the Transport page shows it. Leave driverUserId out for the car you drive or ride in.",
      inputSchema: { driverUserId: UserId.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_car_riders",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          if (args.driverUserId) return await carOf(args.driverUserId);
          const riding = await carRiddenBy(scope.campUserId);
          if (riding) return presentCar(riding);
          return await carOf(scope.campUserId);
        },
      }),
  );

  server.registerTool(
    "get_my_lift",
    {
      title: "My lift this year",
      description:
        "The car you drive this year (your riders, seats and travel), or the car you ride in (its driver, car and travel dates), or null when you have neither.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_lift",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => await getMyLift(scope.campUserId),
      }),
  );

  server.registerTool(
    "add_car_rider",
    {
      title: "Put a member in a car",
      description:
        "Seats an approved member in a car this year. The car's driver may fill their own car (leave driverUserId out); a captain or a Transport & Logistics lead any car. Refused when the car is full, when the member already has a seat in a car, or when they drive their own car this year.",
      inputSchema: { memberUserId: UserId, driverUserId: UserId.optional() },
    },
    async (args, extra) =>
      runTool({
        toolName: "add_car_rider",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const driverUserId = args.driverUserId ?? scope.campUserId;
          const result = await addRider({
            actorId: scope.campUserId,
            driverUserId,
            memberUserId: args.memberUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return await carOf(driverUserId);
        },
      }),
  );

  server.registerTool(
    "remove_car_rider",
    {
      title: "Take a member out of a car",
      description:
        "Takes someone out of a car this year. The car's driver, a captain or a Transport & Logistics lead may take anyone out; a rider may leave the car they ride in (leave memberUserId and driverUserId out to leave your own seat).",
      inputSchema: {
        memberUserId: UserId.optional(),
        driverUserId: UserId.optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_car_rider",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const memberUserId = args.memberUserId ?? scope.campUserId;
          let driverUserId = args.driverUserId;
          if (!driverUserId) {
            if (memberUserId === scope.campUserId) {
              const riding = await carRiddenBy(memberUserId);
              if (!riding) {
                throw new ToolError(
                  "You don't have a seat in a car this year.",
                );
              }
              driverUserId = riding.driverUserId;
            } else {
              driverUserId = scope.campUserId;
            }
          }
          const result = await removeRider({
            actorId: scope.campUserId,
            driverUserId,
            memberUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return await carOf(driverUserId);
        },
      }),
  );
}
