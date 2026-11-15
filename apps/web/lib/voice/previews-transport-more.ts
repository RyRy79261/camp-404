import { TRANSPORT_EDITOR } from "@camp404/core";
import { scopeActor } from "../mcp/scope";
import { getTransportBoard } from "../transport";
import {
  blocked,
  quote,
  shown,
  str,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// Voice's rows for a car's seats and the camp's trailers: the car or trailer
// as it stands, read on the server, and the trailer's version filled in from
// that read.

const NOT_AN_EDITOR =
  "Only a captain or a Transport & Logistics lead keeps the trailers.";

function editor(ctx: PreviewCtx): boolean {
  return TRANSPORT_EDITOR.allows(scopeActor(ctx.scope));
}

async function findTrailer(trailerId: string) {
  const board = await getTransportBoard();
  return {
    board,
    trailer: board.trailers.find((t) => t.id === trailerId) ?? null,
  };
}

export const TRANSPORT_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_car_seats(args, ctx) {
    const driverUserId = str(args.driverUserId) || ctx.scope.campUserId;
    const seats = typeof args.seatsOffered === "number" ? args.seatsOffered : 0;
    const { cars } = await getTransportBoard();
    const car = cars.find((c) => c.driverUserId === driverUserId);
    const own = driverUserId === ctx.scope.campUserId;
    if (!car) {
      return blocked(
        `Set ${own ? "your car's" : "a car's"} seats to ${seats}`,
        own
          ? "You aren't driving this year."
          : "That person isn't driving this year.",
        args,
        "/transport",
      );
    }
    const whose = own ? "your car" : `${car.driverName ?? "a driver"}'s car`;
    const base = {
      sentence: `Set ${whose} to ${seats} seat${seats === 1 ? "" : "s"}`,
      facts: `Transport · ${car.vehicle ?? "car"} · now ${car.seatsOffered ?? 0} seats, ${car.riders.length} taken`,
      path: "/transport",
      args: { seatsOffered: seats, driverUserId },
      keys: [`car:${driverUserId}`],
    };
    if (!own && !editor(ctx)) {
      return {
        ...base,
        blocked:
          "Only its driver, a captain or a Transport & Logistics lead sets a car's seats.",
      };
    }
    if (seats < car.riders.length) {
      return {
        ...base,
        blocked: `${car.riders.length} people already ride in it.`,
      };
    }
    return base;
  },

  async add_trailer(args, ctx) {
    const base = {
      sentence: `Add the trailer ${quote(str(args.name))}`,
      facts: "Transport · this year's trailers",
      ...(args.notes ? { change: [`Notes: ${shown(args.notes)}`] } : {}),
      path: "/transport",
      args,
      keys: [],
    };
    return editor(ctx) ? base : { ...base, blocked: NOT_AN_EDITOR };
  },

  async update_trailer(args, ctx) {
    const { trailer } = await findTrailer(str(args.trailerId));
    if (!trailer) {
      return blocked(
        "Change a trailer",
        "That trailer isn't on this year's list.",
        args,
        "/transport",
      );
    }
    const change: string[] = [];
    if (args.name !== undefined) change.push(`Name: ${shown(args.name)}`);
    if (args.notes !== undefined) change.push(`Notes: ${shown(args.notes)}`);
    const base = {
      sentence: `Change the trailer ${quote(trailer.name)}`,
      facts: `Transport · ${trailer.towedByName ? `towed by ${trailer.towedByName}'s car` : "no car tows it"}`,
      change,
      path: "/transport",
      args: {
        ...args,
        trailerId: trailer.id,
        expectedVersion: trailer.version,
      },
      keys: [`trailer:${trailer.id}`],
    };
    if (!editor(ctx)) return { ...base, blocked: NOT_AN_EDITOR };
    if (change.length === 0) {
      return { ...base, blocked: "Nothing to change was given." };
    }
    return base;
  },

  async set_trailer_tow(args, ctx) {
    const { board, trailer } = await findTrailer(str(args.trailerId));
    if (!trailer) {
      return blocked(
        "Pick the car that tows a trailer",
        "That trailer isn't on this year's list.",
        args,
        "/transport",
      );
    }
    const driverUserId = args.driverUserId ? str(args.driverUserId) : null;
    const car = driverUserId
      ? board.cars.find((c) => c.driverUserId === driverUserId)
      : null;
    const sentence = driverUserId
      ? `Have ${car?.driverName ?? "someone not driving"}'s car tow ${quote(trailer.name)}`
      : `Take ${quote(trailer.name)} off the car towing it`;
    const base = {
      sentence,
      facts: `Transport · ${trailer.towedByName ? `now towed by ${trailer.towedByName}'s car` : "no car tows it now"}`,
      path: "/transport",
      args: {
        trailerId: trailer.id,
        driverUserId,
        expectedVersion: trailer.version,
      },
      keys: [`trailer:${trailer.id}`],
    };
    if (!editor(ctx)) return { ...base, blocked: NOT_AN_EDITOR };
    if (driverUserId && !car) {
      return { ...base, blocked: "That person isn't driving this year." };
    }
    if (car && !car.canTow) {
      return { ...base, blocked: "That car can't tow." };
    }
    if (car && car.trailer && car.trailer.id !== trailer.id) {
      return {
        ...base,
        blocked: `That car already tows ${quote(car.trailer.name)}.`,
      };
    }
    if (trailer.towedByUserId === driverUserId) {
      return { ...base, blocked: "Nothing would change." };
    }
    return base;
  },
};
