// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../transport", () => ({ getTransportBoard: vi.fn() }));

import { getTransportBoard } from "../../transport";
import type { McpScope } from "../../mcp/scope";
import { TRANSPORT_MORE_PREVIEWS } from "../previews-transport-more";

const ME = "11111111-1111-4111-8111-111111111111";
const scope = (over: Partial<McpScope> = {}): McpScope => ({
  campUserId: ME,
  rank: "member",
  viewerRank: "camp_member",
  leadTeams: [],
  memberTeams: [],
  isDriver: true,
  isCaptain: false,
  ...over,
});
const now = new Date("2026-10-06T10:00:00Z");
const lead = scope({
  viewerRank: "team_lead",
  leadTeams: ["transport_and_logistics"],
});

const BOARD = {
  cycle: 1,
  cars: [
    {
      driverUserId: ME,
      driverName: "Dee Driver",
      vehicle: "Land Rover",
      seatsOffered: 3,
      canTow: false,
      riders: [{ userId: "r1", name: "Ri" }],
      trailer: null,
    },
    {
      driverUserId: "tower",
      driverName: "Toby",
      vehicle: "Hilux",
      seatsOffered: 2,
      canTow: true,
      riders: [],
      trailer: null,
    },
  ],
  trailers: [
    {
      id: "tr1",
      name: "Big box",
      notes: null,
      version: 5,
      towedByUserId: null,
      towedByName: null,
    },
  ],
};

describe("transport previews", () => {
  it("sets the caller's own car's seats, and blocks fewer than the riders", async () => {
    vi.mocked(getTransportBoard).mockResolvedValue(BOARD as never);
    const p = await TRANSPORT_MORE_PREVIEWS.set_car_seats!(
      { seatsOffered: 4 },
      { scope: scope(), now },
    );
    expect(p.sentence).toBe("Set your car to 4 seats");
    expect(p.args).toEqual({ seatsOffered: 4, driverUserId: ME });
    expect(p.blocked).toBeUndefined();
    expect(
      (
        await TRANSPORT_MORE_PREVIEWS.set_car_seats!(
          { seatsOffered: 0 },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("1 people already ride in it.");
    expect(
      (
        await TRANSPORT_MORE_PREVIEWS.set_car_seats!(
          { seatsOffered: 4, driverUserId: "tower" },
          { scope: scope(), now },
        )
      ).blocked,
    ).toMatch(/^Only its driver/);
  });

  it("tows a trailer with the version read, and blocks a car that cannot tow or a member", async () => {
    vi.mocked(getTransportBoard).mockResolvedValue(BOARD as never);
    const p = await TRANSPORT_MORE_PREVIEWS.set_trailer_tow!(
      { trailerId: "tr1", driverUserId: "tower", expectedVersion: 0 },
      { scope: lead, now },
    );
    expect(p.sentence).toBe("Have Toby's car tow “Big box”");
    expect(p.args).toEqual({
      trailerId: "tr1",
      driverUserId: "tower",
      expectedVersion: 5,
    });
    expect(p.blocked).toBeUndefined();
    expect(
      (
        await TRANSPORT_MORE_PREVIEWS.set_trailer_tow!(
          { trailerId: "tr1", driverUserId: ME },
          { scope: lead, now },
        )
      ).blocked,
    ).toBe("That car can't tow.");
    expect(
      (
        await TRANSPORT_MORE_PREVIEWS.update_trailer!(
          { trailerId: "tr1", name: "Bigger" },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe(
      "Only a captain or a Transport & Logistics lead keeps the trailers.",
    );
    const rename = await TRANSPORT_MORE_PREVIEWS.update_trailer!(
      { trailerId: "tr1", name: "Bigger" },
      { scope: lead, now },
    );
    expect(rename.change).toEqual(["Name: “Bigger”"]);
    expect(rename.args).toMatchObject({ expectedVersion: 5 });
  });
});
