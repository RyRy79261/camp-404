import { describe, expect, it } from "vitest";
import { Team } from "@camp404/types";
import {
  bookingsLeft,
  canEditAnyInventory,
  canEditInventory,
  maintenanceDue,
  nextMaintenanceDue,
  stillNeeded,
} from "../inventory";

// Inventory (#246): who may change a team's gear, and the small sums the
// pages show.

describe("canEditInventory", () => {
  it("lets a captain change any team's gear", () => {
    for (const team of Team.options) {
      expect(canEditInventory("captain", [], team)).toBe(true);
    }
  });

  it("lets a lead change only the gear of a team they lead", () => {
    expect(canEditInventory("team_lead", ["kitchen"], "kitchen")).toBe(true);
    expect(canEditInventory("team_lead", ["kitchen"], "sound")).toBe(false);
    expect(
      canEditInventory("team_lead", ["sound", "structures"], "structures"),
    ).toBe(true);
  });

  it("refuses a plain member, even one whose led-team list says otherwise", () => {
    expect(canEditInventory("camp_member", ["kitchen"], "kitchen")).toBe(false);
  });

  it("fails closed on an unknown rank or a key that is not a team", () => {
    expect(canEditInventory("founder", ["kitchen"], "kitchen")).toBe(false);
    expect(canEditInventory("captain", [], "storage")).toBe(false);
    expect(canEditInventory("team_lead", ["storage"], "storage")).toBe(false);
    expect(canEditInventory("", [], "")).toBe(false);
  });

  it("offers Add to anyone who may change at least one team's gear", () => {
    expect(canEditAnyInventory("captain", [])).toBe(true);
    expect(canEditAnyInventory("team_lead", ["water"])).toBe(true);
    expect(canEditAnyInventory("team_lead", [])).toBe(false);
    expect(canEditAnyInventory("camp_member", ["water"])).toBe(false);
  });
});

describe("stillNeeded", () => {
  it("is the need less what the camp has, what was bought and what was pledged", () => {
    expect(stillNeeded({ quantity: 10, have: 4, bought: 1, pledged: 3 })).toBe(
      2,
    );
  });

  it("never goes below 0", () => {
    expect(stillNeeded({ quantity: 2, have: 4, bought: 0, pledged: 1 })).toBe(
      0,
    );
  });
});

describe("bookingsLeft", () => {
  it("counts down from the item's limit", () => {
    expect(bookingsLeft(3, 1)).toBe(2);
    expect(bookingsLeft(3, 3)).toBe(0);
    expect(bookingsLeft(3, 5)).toBe(0);
  });

  it("is 0 for an item with no limit, so it is never booked by mistake", () => {
    expect(bookingsLeft(null, 0)).toBe(0);
    expect(bookingsLeft(0, 0)).toBe(0);
  });
});

describe("maintenance", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;

  it("is due one interval after the last time", () => {
    const last = new Date(now.getTime() - 10 * day);
    expect(nextMaintenanceDue(true, 30, last)?.getTime()).toBe(
      last.getTime() + 30 * day,
    );
    expect(
      maintenanceDue(
        {
          requiresMaintenance: true,
          maintenanceIntervalDays: 30,
          lastMaintainedAt: last,
        },
        now,
      ),
    ).toBe(false);
    expect(
      maintenanceDue(
        {
          requiresMaintenance: true,
          maintenanceIntervalDays: 7,
          lastMaintainedAt: last,
        },
        now,
      ),
    ).toBe(true);
  });

  it("is due now when it was never done, and never when it needs none", () => {
    expect(
      maintenanceDue(
        {
          requiresMaintenance: true,
          maintenanceIntervalDays: 30,
          lastMaintainedAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      maintenanceDue(
        {
          requiresMaintenance: false,
          maintenanceIntervalDays: 30,
          lastMaintainedAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(nextMaintenanceDue(false, 30, now)).toBeNull();
  });
});
