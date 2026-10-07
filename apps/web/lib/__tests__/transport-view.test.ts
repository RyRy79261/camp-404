import { describe, expect, it } from "vitest";
import type { MyLift } from "@camp404/db/cars";
import type {
  LiftRequestRow,
  TrailerRow,
  TransportCar,
  UnseatedMember,
} from "@camp404/db/transport";
import {
  dayLabel,
  liftPanel,
  needsSeatRows,
  seatChoices,
  seatsCell,
  shortCarLabel,
  towChoices,
  trailerCell,
  transportFuel,
  transportStrip,
} from "../transport-view";

// The Transport page's rows (owner's Option A, 2026-10-01): one row per
// person, the people who still need a seat merged with the lift requests, the
// cars a person can be seated in, and the viewer's own panel.

function car(
  driverUserId: string,
  driverName: string,
  over: Partial<TransportCar> = {},
): TransportCar {
  return {
    driverUserId,
    driverName,
    vehicle: "Toyota Hilux",
    vehicleMake: "Toyota",
    departureCity: "Cape Town",
    seatsOffered: 3,
    canTow: false,
    riders: [],
    trailer: null,
    ...over,
  };
}

const rider = (userId: string, name: string) => ({ userId, name });

const request = (
  userId: string,
  name: string,
  driverUserId: string | null,
): LiftRequestRow => ({
  userId,
  name,
  driverUserId,
  createdAt: new Date("2027-01-01T00:00:00Z"),
});

const sipho = car("sipho", "Sipho Ndlovu", {
  vehicle: "Land Rover Defender 110",
  vehicleMake: "Land Rover",
  departureCity: "Johannesburg",
  seatsOffered: 4,
  riders: [rider("zanele", "Zanele Mokoena")],
});
const dana = car("dana", "Dana van der Merwe", {
  seatsOffered: 3,
  riders: [rider("rae", "Rae Jacobs"), rider("tom", "Tom Botha")],
});
const lee = car("lee", "Lee-Anne Petersen", {
  vehicle: "VW Polo Vivo",
  vehicleMake: "VW",
  seatsOffered: 1,
  riders: [rider("kat", "Katherine Wessels")],
});
const mike = car("mike", "Mike Fourie", {
  vehicle: null,
  vehicleMake: null,
  departureCity: null,
  seatsOffered: null,
});
const CARS = [dana, lee, mike, sipho];

describe("needsSeatRows", () => {
  const unseated: UnseatedMember[] = [
    { userId: "mo", name: "Mo Adams", status: "maybe" },
    { userId: "pieter", name: "Pieter Grobler", status: "applied" },
    { userId: "jess", name: "Jess Naidoo", status: "accepted" },
    { userId: "ayesha", name: "Ayesha Khan", status: "accepted" },
  ];

  it("puts Accepted first, then coming, then maybe, by name inside each", () => {
    const rows = needsSeatRows(unseated, [], CARS);
    expect(rows.map((r) => [r.name, r.thisYear])).toEqual([
      ["Ayesha Khan", "accepted"],
      ["Jess Naidoo", "accepted"],
      ["Pieter Grobler", "applied"],
      ["Mo Adams", "maybe"],
    ]);
  });

  it("shows each person once, with what they asked for", () => {
    const rows = needsSeatRows(
      unseated,
      [
        request("jess", "Jess Naidoo", "sipho"),
        request("pieter", "Pieter Grobler", null),
        // Asked, but not on the attendance list: still one row, last.
        request("gus", "Gus Ghost", "dana"),
      ],
      CARS,
    );
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.userId === "jess")?.asked).toEqual({
      kind: "car",
      driverUserId: "sipho",
      label: "Sipho's Land Rover",
      requestedAt: "2027-01-01T00:00:00.000Z",
    });
    expect(rows.find((r) => r.userId === "pieter")?.asked).toEqual({
      kind: "any",
      requestedAt: "2027-01-01T00:00:00.000Z",
    });
    expect(rows.find((r) => r.userId === "ayesha")?.asked).toEqual({
      kind: "none",
    });
    expect(rows.at(-1)).toMatchObject({ userId: "gus", thisYear: null });
  });
});

describe("seatChoices", () => {
  it("offers only cars with a counted free seat, the asked one first", () => {
    const { choices, note } = seatChoices(CARS, "sipho");
    expect(choices.map((c) => [c.driverUserId, c.free, c.asked])).toEqual([
      ["sipho", 3, true],
      ["dana", 1, false],
    ]);
    expect(choices[0]).toMatchObject({
      label: "Sipho Ndlovu's Land Rover Defender 110",
      short: "Sipho's Land Rover",
      from: "Johannesburg",
    });
    expect(note).toBe(
      "Lee-Anne's VW is full. Mike hasn't said how many seats they have.",
    );
  });

  it("has no note when every car has room", () => {
    expect(seatChoices([sipho], null).note).toBeNull();
  });
});

describe("cars", () => {
  it("says seats as people say them", () => {
    expect(seatsCell(dana)).toMatchObject({
      text: "2 of 3 taken",
      muted: false,
    });
    expect(seatsCell(lee)).toMatchObject({ text: "Full, 1 of 1", ratio: 1 });
    expect(seatsCell(mike)).toMatchObject({ text: "Not said", ratio: null });
    expect(
      seatsCell({ seatsOffered: null, riders: [rider("a", "A")] }).sub,
    ).toBe("1 rider");
  });

  it("names the trailer, can tow, can't tow, or a dash with no form", () => {
    expect(
      trailerCell({ ...dana, trailer: { id: "t", name: "Box" } }).text,
    ).toBe("Tows Box");
    expect(trailerCell({ ...dana, canTow: true }).text).toBe("Can tow");
    expect(trailerCell(dana)).toEqual({ text: "Can't tow", muted: true });
    expect(trailerCell(mike).text).toBe("—");
  });

  it("offers a trailer only the cars that can tow and tow nothing else", () => {
    const towing = {
      ...dana,
      canTow: true,
      trailer: { id: "t1", name: "Box" },
    };
    const free = { ...sipho, canTow: true };
    expect(
      towChoices([towing, free, lee], { id: "t2" }).map((c) => c.short),
    ).toEqual(["Sipho's Land Rover"]);
    expect(
      towChoices([towing, free, lee], { id: "t1" }).map((c) => c.short),
    ).toEqual(["Dana's Toyota", "Sipho's Land Rover"]);
    // No make on the form: the label falls back to "car".
    expect(
      shortCarLabel({ driverName: "Mike Fourie", vehicleMake: null }),
    ).toBe("Mike's car");
  });
});

describe("transportStrip", () => {
  const trailers: TrailerRow[] = [
    {
      id: "a",
      name: "Box",
      notes: null,
      version: 0,
      towedByUserId: "dana",
      towedByName: null,
    },
    {
      id: "b",
      name: "Water",
      notes: null,
      version: 0,
      towedByUserId: null,
      towedByName: null,
    },
  ];

  it("counts free seats only in cars whose seats are counted", () => {
    const strip = transportStrip({ cars: CARS, trailers, needSeat: 4 });
    expect(strip).toEqual([
      { key: "cars", label: "Cars", value: 4, of: null },
      { key: "seats", label: "Seats free", value: 4, of: 8 },
      { key: "need", label: "Need a seat", value: 4, of: null },
      { key: "trailers", label: "Trailers with no car", value: 1, of: 2 },
    ]);
  });

  it("shows a reader how many ride, not who needs a seat", () => {
    const strip = transportStrip({ cars: CARS, trailers, needSeat: null });
    expect(strip[2]).toEqual({
      key: "riders",
      label: "Riders",
      value: 4,
      of: null,
    });
  });
});

describe("liftPanel", () => {
  const arrivalAt = new Date("2027-04-26T00:00:00.000Z");

  it("gives a rider the driver, the car, the day and who else rides", () => {
    const lift: MyLift = {
      role: "rider",
      driverName: "Sipho Ndlovu",
      vehicle: "Land Rover Defender 110",
      departureCity: "Johannesburg",
      arrivalAt,
      departureAt: null,
    };
    const withMe = {
      ...sipho,
      riders: [...sipho.riders, rider("me", "Thandeka Dlamini")],
    };
    expect(
      liftPanel({ me: "me", lift, cars: [dana, withMe], requests: [] }),
    ).toEqual({
      kind: "rider",
      driverUserId: "sipho",
      driverName: "Sipho Ndlovu",
      vehicle: "Land Rover Defender 110",
      from: "Johannesburg",
      arriving: "Mon 26 Apr",
      ridingWith: ["Zanele Mokoena"],
    });
  });

  it("gives a driver their riders and only the requests for their car", () => {
    const lift: MyLift = {
      role: "driver",
      vehicle: "Land Rover Defender 110",
      seatsOffered: 4,
      riders: ["Zanele Mokoena"],
      departureCity: "Johannesburg",
      arrivalAt: null,
      departureAt: null,
    };
    const panel = liftPanel({
      me: "sipho",
      lift,
      cars: CARS,
      requests: [
        request("jess", "Jess Naidoo", "sipho"),
        request("pieter", "Pieter Grobler", "dana"),
      ],
    });
    expect(panel).toMatchObject({
      kind: "driver",
      arriving: null,
      riders: [{ userId: "zanele", name: "Zanele Mokoena" }],
      asking: [
        {
          userId: "jess",
          name: "Jess Naidoo",
          requestedAt: "2027-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("says who a request waits for", () => {
    expect(
      liftPanel({
        me: "jess",
        lift: null,
        cars: CARS,
        requests: [request("jess", "Jess Naidoo", "sipho")],
      }),
    ).toEqual({
      kind: "asked",
      car: "Sipho Ndlovu's Land Rover Defender 110",
      waitingFor: "Sipho",
    });
    expect(
      liftPanel({
        me: "jess",
        lift: null,
        cars: CARS,
        requests: [request("jess", "Jess Naidoo", null)],
      }),
    ).toEqual({ kind: "asked", car: null, waitingFor: "a Transport lead" });
  });

  it("offers a member with no lift only cars with counted free seats", () => {
    const panel = liftPanel({
      me: "ayesha",
      lift: null,
      cars: CARS,
      requests: [],
    });
    expect(panel).toEqual({
      kind: "none",
      cars: [
        {
          driverUserId: "dana",
          label: "Dana van der Merwe's Toyota Hilux (1 free)",
        },
        {
          driverUserId: "sipho",
          label: "Sipho Ndlovu's Land Rover Defender 110 (3 free)",
        },
      ],
    });
  });

  it("reads a driver-form day in UTC", () => {
    expect(dayLabel(new Date("2027-04-26T00:00:00.000Z"))).toBe("Mon 26 Apr");
    expect(dayLabel(null)).toBeNull();
  });
});

describe("transportFuel", () => {
  const dana = car("dana", "Dana van der Merwe");
  const sipho2 = car("sipho", "Sipho Ndlovu");
  const fuelCan = (
    sizeLitres: number,
    travelsWithUserId: string | null,
    ownerName: string | null = null,
  ) => ({
    ownerUserId: ownerName ? "owner" : null,
    ownerName,
    sizeLitres,
    material: "metal" as const,
    travelsWithUserId,
    note: null,
  });
  const cans = [
    fuelCan(25, "dana"),
    fuelCan(25, "sipho"),
    fuelCan(20, "dana", "Pat Mokoena"),
    fuelCan(20, "sipho", "Pat Mokoena"),
    fuelCan(15, null),
  ];

  it("totals each car's cans and lists the driver's own, numbered as the sheet", () => {
    const fuel = transportFuel(cans, [dana, sipho2], "sipho");
    expect(fuel.byCar.get("dana")).toEqual({ cans: 2, litres: 45 });
    expect(fuel.byCar.get("sipho")).toEqual({ cans: 2, litres: 45 });
    expect(fuel.mine).toEqual([
      {
        number: 2,
        ownerName: "Camp",
        sizeLitres: 25,
        material: "metal",
        note: null,
      },
      {
        number: 4,
        ownerName: "Pat Mokoena",
        sizeLitres: 20,
        material: "metal",
        note: null,
      },
    ]);
  });

  it("gives a rider, or a driver not driving this year, nothing to fill", () => {
    expect(transportFuel(cans, [dana, sipho2], "rae").mine).toEqual([]);
    expect(transportFuel(cans, [dana], "sipho").mine).toEqual([]);
  });
});
