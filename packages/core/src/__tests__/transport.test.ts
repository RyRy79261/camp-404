import { describe, expect, it } from "vitest";
import {
  TRANSPORT_TEAM,
  canEditTransport,
  canManageCar,
  canRemoveRider,
  seatsLeft,
  transportTotals,
  vehicleLabel,
} from "../transport";

// Who may work in the transport tool (#270): a captain or a Transport &
// Logistics lead for everything, a driver for their own car, a rider to leave.

const ADA = "a";
const BEA = "b";
const CAI = "c";

describe("canEditTransport", () => {
  it("lets a captain and a Transport & Logistics lead in", () => {
    expect(canEditTransport("captain", [])).toBe(true);
    expect(canEditTransport("team_lead", [TRANSPORT_TEAM])).toBe(true);
    expect(canEditTransport("team_lead", ["kitchen", TRANSPORT_TEAM])).toBe(
      true,
    );
  });

  it("refuses a lead of another team and a plain member", () => {
    expect(canEditTransport("team_lead", ["kitchen"])).toBe(false);
    expect(canEditTransport("team_lead", [])).toBe(false);
    // A member's led teams cannot lift them: the rank decides first.
    expect(canEditTransport("camp_member", [TRANSPORT_TEAM])).toBe(false);
  });

  it("fails closed on an unknown rank", () => {
    expect(canEditTransport("owner", [TRANSPORT_TEAM])).toBe(false);
    expect(canEditTransport("", [])).toBe(false);
  });
});

describe("canManageCar", () => {
  it("lets the car's driver and the transport editors manage it", () => {
    expect(canManageCar("camp_member", [], ADA, ADA)).toBe(true);
    expect(canManageCar("captain", [], BEA, ADA)).toBe(true);
    expect(canManageCar("team_lead", [TRANSPORT_TEAM], BEA, ADA)).toBe(true);
  });

  it("refuses another driver, a rider, and a lead of another team", () => {
    expect(canManageCar("camp_member", [], CAI, ADA)).toBe(false);
    expect(canManageCar("team_lead", ["kitchen"], BEA, ADA)).toBe(false);
  });

  it("fails closed on an unknown rank or an empty id", () => {
    expect(canManageCar("owner", [], ADA, ADA)).toBe(false);
    expect(canManageCar("camp_member", [], "", "")).toBe(false);
  });
});

describe("canRemoveRider", () => {
  it("lets a rider leave, and the car's managers take anyone out", () => {
    expect(canRemoveRider("camp_member", [], BEA, ADA, BEA)).toBe(true);
    expect(canRemoveRider("camp_member", [], ADA, ADA, BEA)).toBe(true);
    expect(canRemoveRider("team_lead", [TRANSPORT_TEAM], CAI, ADA, BEA)).toBe(
      true,
    );
  });

  it("refuses one rider taking another out", () => {
    expect(canRemoveRider("camp_member", [], CAI, ADA, BEA)).toBe(false);
    expect(canRemoveRider("team_lead", ["kitchen"], CAI, ADA, BEA)).toBe(false);
    expect(canRemoveRider("owner", [], BEA, ADA, BEA)).toBe(false);
  });
});

describe("counts", () => {
  it("counts seats left, never below none, and nothing when unsaid", () => {
    expect(seatsLeft(3, 1)).toBe(2);
    expect(seatsLeft(1, 3)).toBe(0);
    expect(seatsLeft(null, 2)).toBeNull();
  });

  it("adds up cars, seats, travellers and trailers", () => {
    expect(
      transportTotals(
        [
          { seatsOffered: 3, riders: 1 },
          { seatsOffered: null, riders: 2 },
          { seatsOffered: 2, riders: 2 },
        ],
        [{ towedByUserId: ADA }, { towedByUserId: null }],
      ),
    ).toEqual({
      cars: 3,
      seatsOffered: 5,
      seatsTaken: 5,
      seatsLeft: 2,
      travelling: 8,
      trailers: 2,
      trailersTowed: 1,
    });
  });

  it("names a car by make and model, or not at all", () => {
    expect(vehicleLabel("Toyota", " Hilux ")).toBe("Toyota Hilux");
    expect(vehicleLabel(null, "Hilux")).toBe("Hilux");
    expect(vehicleLabel(" ", null)).toBeNull();
  });
});
