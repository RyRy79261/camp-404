import { beforeEach, describe, expect, it, vi } from "vitest";

// setTicketPassAction: a captain records a member's DDT or
// WAP. Covers the captain bar (a team lead is refused), the
// boundary (a pass only takes its own values), and the compare-and-set: a
// change another captain made first is not overwritten, and the captain is
// told so by name.

vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/tickets", () => ({ setTicketPass: vi.fn() }));
vi.mock("@/lib/users", () => ({ findCampUserById: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { captainActionGate } from "@/lib/captain-gate";
import { setTicketPass } from "@/lib/tickets";
import { findCampUserById } from "@/lib/users";
import { setTicketPassAction } from "./actions";

const CAPTAIN = "cap-1";

function asCaptain() {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: CAPTAIN, rank: "captain" },
    rank: "captain",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setTicketPass).mockResolvedValue(true);
  vi.mocked(findCampUserById).mockImplementation(
    async (id: string) =>
      ({ id, rank: "member", displayName: "Nova Reyes" }) as never,
  );
});

describe("setTicketPassAction", () => {
  it("records a change with the captain's id and the value they saw", async () => {
    asCaptain();

    const res = await setTicketPassAction({
      userId: "member-1",
      pass: "wap",
      from: "requested",
      to: "issued",
    });

    expect(res).toEqual({ ok: true });
    expect(captainActionGate).toHaveBeenCalledWith("captain");
    expect(setTicketPass).toHaveBeenCalledWith({
      userId: "member-1",
      pass: "wap",
      from: "requested",
      to: "issued",
      actorUserId: CAPTAIN,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/captains/applications");
    expect(revalidatePath).toHaveBeenCalledWith("/captains/overview");
  });

  it("refuses anyone the captain gate refuses, a team lead included, before any write", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    } as never);

    const res = await setTicketPassAction({
      userId: "member-1",
      pass: "ddt",
      from: "none",
      to: "allocated",
    });

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    expect(setTicketPass).not.toHaveBeenCalled();
  });

  it("refuses a value of the other pass, or an unknown pass", async () => {
    asCaptain();

    expect(
      await setTicketPassAction({
        userId: "member-1",
        pass: "wap",
        from: "not_needed",
        to: "allocated",
      }),
    ).toEqual({ ok: false, error: "Unknown change." });
    expect(
      await setTicketPassAction({
        userId: "member-1",
        pass: "vehicle_pass",
        from: "none",
        to: "issued",
      }),
    ).toEqual({ ok: false, error: "Unknown change." });
    expect(setTicketPass).not.toHaveBeenCalled();
  });

  it("tells the captain by name when another captain changed it first", async () => {
    asCaptain();
    vi.mocked(setTicketPass).mockResolvedValue(false);

    const res = await setTicketPassAction({
      userId: "member-1",
      pass: "ddt",
      from: "none",
      to: "allocated",
    });

    expect(res).toEqual({
      ok: false,
      error:
        "Nova Reyes's ticket changed while you were looking. Refresh to see it.",
    });
  });

  it("says so for a member who is not there", async () => {
    asCaptain();
    vi.mocked(findCampUserById).mockResolvedValue(null);

    const res = await setTicketPassAction({
      userId: "gone",
      pass: "ddt",
      from: "none",
      to: "allocated",
    });

    expect(res).toEqual({ ok: false, error: "Member not found." });
    expect(setTicketPass).not.toHaveBeenCalled();
  });
});
