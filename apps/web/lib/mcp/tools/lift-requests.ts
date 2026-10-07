import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  getTransportBoard,
  listLiftRequests,
  requestLift,
  withdrawLiftRequest,
} from "../../transport";
import { TRANSPORT_PATH } from "../../transport-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// A member's own lift request over MCP, through the Transport page's own
// functions (lib/transport.ts → @camp404/db/transport). The request is the
// caller's (their id, never one passed in). The write re-reads them inside its
// transaction: an approved member, not driving, without a seat; a car they
// name must be someone else's car this year. A second request replaces the
// first, as on the page. Answering requests stays on the page (the driver's,
// or a captain's or Transport & Logistics lead's). No audit row: the site
// writes none for a member's own request.

/** The caller's own request this year, or null. */
async function myRequest(userId: string) {
  const [requests, board] = await Promise.all([
    listLiftRequests(),
    getTransportBoard(),
  ]);
  const mine = requests.find((r) => r.userId === userId);
  if (!mine) return null;
  const car = mine.driverUserId
    ? board.cars.find((c) => c.driverUserId === mine.driverUserId)
    : undefined;
  return {
    car: mine.driverUserId
      ? { driverUserId: mine.driverUserId, driverName: car?.driverName ?? null }
      : null,
    anyCar: mine.driverUserId === null,
    askedAt: mine.createdAt,
  };
}

export function registerLiftRequestTools(server: McpServer): void {
  server.registerTool(
    "get_my_lift_request",
    {
      title: "My lift request",
      description:
        "Your lift request this year, as the Transport page shows it to you: the car you asked for (or any car) and when, or null when you have none.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_lift_request",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => ({
          request: await myRequest(scope.campUserId),
          url: siteUrl(TRANSPORT_PATH),
        }),
      }),
  );

  server.registerTool(
    "request_lift",
    {
      title: "Ask for a lift",
      description:
        "Asks for a seat this year, as the Transport page's Ask for a lift: in one car (its driver's id, from list_drivers) or, with driverUserId null, in any car. A new request replaces your last one. Refused when you drive this year, already have a seat, or the person you name is not driving. The driver, or a captain or Transport & Logistics lead, answers it on the website.",
      inputSchema: z.object({ driverUserId: z.string().uuid().nullable() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "request_lift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await requestLift({
            actorId: scope.campUserId,
            driverUserId: args.driverUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { request: await myRequest(scope.campUserId) };
        },
      }),
  );

  server.registerTool(
    "cancel_lift_request",
    {
      title: "Withdraw my lift request",
      description:
        "Withdraws your lift request this year, as the Transport page's Withdraw does.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "cancel_lift_request",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const result = await withdrawLiftRequest({
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { request: null };
        },
      }),
  );
}
