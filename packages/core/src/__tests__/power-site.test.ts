import { describe, expect, it } from "vitest";
import {
  canTotals,
  cansToFill,
  fillingCar,
  fuelSheetDays,
} from "../power-site";

// The fuel cans (#255, the owner's register of 2026-10-02): who fills a can is
// never stored, it is the driver of the car the can travels with.

const dana = { driverUserId: "dana", name: "Dana" };
const sipho = { driverUserId: "sipho", name: "Sipho" };
const mike = { driverUserId: "mike", name: "Mike" };
const cars = [dana, sipho, mike];

const can = (sizeLitres: number, travelsWithUserId: string | null) => ({
  sizeLitres,
  travelsWithUserId,
});

// The mock-up's ten cans: three on Dana's car, two on Sipho's, one on Mike's,
// two on a car that stopped driving this year (Lee), two on none.
const cans = [
  can(25, "dana"),
  can(25, "dana"),
  can(25, "sipho"),
  can(20, "dana"),
  can(20, "sipho"),
  can(20, "lee"),
  can(20, "mike"),
  can(10, "lee"),
  can(25, null),
  can(15, null),
];

describe("fillingCar", () => {
  it("is the car the can travels with: its driver fills it", () => {
    expect(fillingCar(can(20, "sipho"), cars)).toBe(sipho);
  });

  it("is nobody for a can on no car, or on a car not driving this year", () => {
    expect(fillingCar(can(20, null), cars)).toBeNull();
    expect(fillingCar(can(20, "lee"), cars)).toBeNull();
  });
});

describe("canTotals", () => {
  it("counts each driver's cans and litres, and the cans on no car", () => {
    const t = canTotals(cans, cars);
    expect(t.cars.map((c) => [c.car.name, c.cans, c.litres])).toEqual([
      ["Dana", 3, 70],
      ["Sipho", 2, 45],
      ["Mike", 1, 20],
    ]);
    // Lee no longer drives: those two cans are on no car, with the two unset.
    expect(t.notOnCar).toEqual({ cans: 4, litres: 70 });
    expect(t.all).toEqual({ cans: 10, litres: 205 });
  });

  it("lists a car with nothing to fill, and an empty list as nothing", () => {
    const t = canTotals([], cars);
    expect(t.cars.map((c) => c.cans)).toEqual([0, 0, 0]);
    expect(t.notOnCar).toEqual({ cans: 0, litres: 0 });
    expect(t.all).toEqual({ cans: 0, litres: 0 });
  });
});

describe("cansToFill", () => {
  it("is the cans in the driver's own car, in the list's order", () => {
    const mine = cansToFill(cans, "sipho");
    expect(mine.map((c) => c.sizeLitres)).toEqual([25, 20]);
    expect(cansToFill(cans, "nobody")).toEqual([]);
  });
});

describe("fuelSheetDays", () => {
  it("takes the powered days, marking build and strike around the Burn", () => {
    const days = fuelSheetDays({
      firstPoweredDay: "2027-04-24",
      daysOnSite: 10,
      burnStart: "2027-04-26",
      burnEnd: "2027-05-02",
    });
    expect(days).toHaveLength(10);
    expect(days[0]).toEqual({ date: "2027-04-24", phase: "build" });
    expect(days[2]).toEqual({ date: "2027-04-26", phase: "burn" });
    expect(days[9]).toEqual({ date: "2027-05-03", phase: "strike" });
  });

  it("falls back on the Burn's dates, then on nothing", () => {
    const days = fuelSheetDays({
      firstPoweredDay: null,
      daysOnSite: 11,
      burnStart: "2027-04-26",
      burnEnd: "2027-05-02",
    });
    expect(days.map((d) => d.date)).toEqual([
      "2027-04-26",
      "2027-04-27",
      "2027-04-28",
      "2027-04-29",
      "2027-04-30",
      "2027-05-01",
      "2027-05-02",
    ]);
    expect(
      fuelSheetDays({
        firstPoweredDay: null,
        daysOnSite: 11,
        burnStart: null,
        burnEnd: null,
      }),
    ).toEqual([]);
  });
});
