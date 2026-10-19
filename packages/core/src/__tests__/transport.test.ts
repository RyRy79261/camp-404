import { describe, expect, it } from "vitest";
import {
  ALREADY_SEATED,
  ALREADY_TOWING,
  CANNOT_TOW,
  CAR_FULL,
  IS_DRIVING,
  LIFT_REQUEST_CHANGED,
  LIFT_REQUEST_GONE,
  NOT_DRIVING,
  NOT_YOUR_CAR,
  OWN_CAR,
  SEATS_BELOW_RIDERS,
  TRANSPORT_NOT_A_MEMBER,
  TRANSPORT_TEAM,
  YOU_ARE_DRIVING,
  YOU_HAVE_A_SEAT,
  canEditTransport,
  liftAnswerProblem,
  liftRequestProblem,
  seatProblem,
  seatsOfferedProblem,
  towProblem,
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

describe("seatProblem", () => {
  const free = {
    driverUserId: ADA,
    memberUserId: BEA,
    car: { seatsOffered: 2 },
    memberApproved: true,
    memberDrives: false,
    seated: false,
    riders: 1,
  };

  it("seats an approved member in a car with a seat free, or one that has not said", () => {
    expect(seatProblem(free)).toBeNull();
    expect(
      seatProblem({ ...free, car: { seatsOffered: null }, riders: 9 }),
    ).toBeNull();
  });

  it("refuses in the database's order", () => {
    const worst = {
      ...free,
      memberUserId: ADA,
      car: null,
      memberApproved: false,
      memberDrives: true,
      seated: true,
      riders: 5,
    };
    expect(seatProblem(worst)).toBe(OWN_CAR);
    expect(seatProblem({ ...worst, memberUserId: BEA })).toBe(NOT_DRIVING);
    const driving = { ...worst, memberUserId: BEA, car: { seatsOffered: 2 } };
    expect(seatProblem(driving)).toBe(TRANSPORT_NOT_A_MEMBER);
    expect(seatProblem({ ...driving, memberApproved: true })).toBe(IS_DRIVING);
    expect(
      seatProblem({ ...driving, memberApproved: true, memberDrives: false }),
    ).toBe(ALREADY_SEATED);
    expect(seatProblem({ ...free, riders: 2 })).toBe(CAR_FULL);
  });
});

describe("seatsOfferedProblem", () => {
  it("refuses a car that does not drive, then fewer seats than riders", () => {
    expect(seatsOfferedProblem(false, 9, 0)).toBe(NOT_DRIVING);
    expect(seatsOfferedProblem(true, 2, 1)).toBe(SEATS_BELOW_RIDERS);
    expect(seatsOfferedProblem(true, 2, 2)).toBeNull();
  });
});

describe("liftRequestProblem", () => {
  const ask = {
    actorId: BEA,
    driverUserId: ADA,
    memberApproved: true,
    drives: false,
    seated: false,
    carDrives: true,
  };

  it("lets a member ask for a car that drives, or for any car", () => {
    expect(liftRequestProblem(ask)).toBeNull();
    expect(
      liftRequestProblem({ ...ask, driverUserId: null, carDrives: false }),
    ).toBeNull();
  });

  it("refuses in the database's order", () => {
    const worst = {
      ...ask,
      driverUserId: BEA,
      memberApproved: false,
      drives: true,
      seated: true,
      carDrives: false,
    };
    expect(liftRequestProblem(worst)).toBe(TRANSPORT_NOT_A_MEMBER);
    const member = { ...worst, memberApproved: true };
    expect(liftRequestProblem(member)).toBe(YOU_ARE_DRIVING);
    expect(liftRequestProblem({ ...member, drives: false })).toBe(
      YOU_HAVE_A_SEAT,
    );
    const free = { ...member, drives: false, seated: false };
    expect(liftRequestProblem(free)).toBe(OWN_CAR);
    expect(liftRequestProblem({ ...free, driverUserId: ADA })).toBe(
      NOT_DRIVING,
    );
  });
});

describe("liftAnswerProblem", () => {
  const at = new Date("2027-03-01T10:00:00.000Z");
  const driver = { id: ADA, rank: "camp_member", ledTeams: [] as string[] };
  const lead = { id: CAI, rank: "team_lead", ledTeams: [TRANSPORT_TEAM] };
  const otherLead = { id: CAI, rank: "team_lead", ledTeams: ["kitchen"] };
  const forAda = { driverUserId: ADA, createdAt: at };
  const anyCar = { driverUserId: null, createdAt: at };
  const answer = (
    actor: typeof driver,
    request: typeof forAda | typeof anyCar | null,
    accept = true,
    requestedAt = at.toISOString(),
  ) => liftAnswerProblem({ actor, request, requestedAt, accept });

  it("lets the asked driver or a transport editor answer the request they saw", () => {
    expect(answer(driver, forAda)).toBeNull();
    expect(answer(lead, forAda)).toBeNull();
    expect(answer(lead, anyCar, false)).toBeNull();
  });

  it("refuses a gone or changed request, another car's driver and another team's lead", () => {
    expect(answer(driver, null)).toBe(LIFT_REQUEST_GONE);
    expect(answer(lead, forAda, true, "2027-03-01T10:00:00.001Z")).toBe(
      LIFT_REQUEST_CHANGED,
    );
    expect(answer({ ...driver, id: BEA }, forAda)).toBe(NOT_YOUR_CAR);
    expect(answer(otherLead, anyCar, false)).toBe(NOT_YOUR_CAR);
    expect(answer(driver, anyCar, false)).toBe(NOT_YOUR_CAR);
  });

  it("cannot accept a request for any car: an editor seats them instead", () => {
    expect(answer(lead, anyCar, true)).toBe(LIFT_REQUEST_GONE);
  });
});

describe("towProblem", () => {
  it("refuses a car that does not drive, cannot tow, or tows another", () => {
    expect(towProblem(null, false)).toBe(NOT_DRIVING);
    expect(towProblem({ canTow: false }, false)).toBe(CANNOT_TOW);
    expect(towProblem({ canTow: true }, true)).toBe(ALREADY_TOWING);
    expect(towProblem({ canTow: true }, false)).toBeNull();
  });
});
