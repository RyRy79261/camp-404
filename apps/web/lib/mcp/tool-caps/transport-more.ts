import { GATES, type ToolCapability } from "../gates";

// The Transport page's seats, lift requests and trailers over the connector
// (lib/mcp/tools/transport-more.ts). The page's door is any member; the
// writes decide inside their transaction: a car's seats are its driver's, a
// captain's or a Transport & Logistics lead's (canManageCar), and the
// trailers are a captain's or a Transport & Logistics lead's (TRANSPORT_EDITOR,
// the write's own check, so their gate says so up front).

export const TRANSPORT_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  list_lift_requests: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "Open lift requests you may see (captains and Transport & Logistics leads: all of them, and who still needs a seat; drivers: those for their car).",
    page: "/transport",
  },
  set_car_seats: {
    kind: "write",
    area: "Transport",
    gate: GATES.member,
    does: "Set how many seats a car offers: your own car (captains and Transport & Logistics leads: any car). Never below the riders already in.",
    page: "/transport",
  },
  list_trailers: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "This year's trailers, their notes, which car tows each, and the version a change needs.",
    page: "/transport",
  },
  add_trailer: {
    kind: "write",
    area: "Transport",
    gate: GATES.transportEditor,
    does: "Add a trailer to this year's list.",
    page: "/transport",
  },
  update_trailer: {
    kind: "write",
    area: "Transport",
    gate: GATES.transportEditor,
    does: "Rename a trailer or change its notes, on the version you read.",
    page: "/transport",
  },
  set_trailer_tow: {
    kind: "write",
    area: "Transport",
    gate: GATES.transportEditor,
    does: "Say which car tows a trailer, or none, on the version you read.",
    page: "/transport",
  },
};
