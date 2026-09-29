import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's own ticket answer (#238). The page only offers it to someone who
// might come; the action holds the same line, so a stale tab or a hand-made
// request cannot record a ticket for a member who said No or never answered.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/participations", () => ({ getMyParticipation: vi.fn() }));
vi.mock("@/lib/tickets", () => ({ setMyTicketStatus: vi.fn() }));

import { captainActionGate } from "@/lib/captain-gate";
import { getMyParticipation } from "@/lib/participations";
import { setMyTicketStatus } from "@/lib/tickets";
import { setMyTicketAction } from "./actions";

function answered(status: string | null) {
  vi.mocked(getMyParticipation).mockResolvedValue(
    status === null ? null : ({ status, intent: "yes" } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "member-1" },
  } as never);
});

describe("setMyTicketAction", () => {
  it.each(["applied", "maybe", "accepted", "waitlisted"])(
    "saves the answer of a member whose year is %s",
    async (status) => {
      answered(status);
      expect(await setMyTicketAction({ ticketStatus: "has_ticket" })).toEqual({
        ok: true,
      });
      expect(setMyTicketStatus).toHaveBeenCalledExactlyOnceWith({
        userId: "member-1",
        ticketStatus: "has_ticket",
      });
    },
  );

  it.each([["not_attending"], [null]])(
    "refuses a member whose year is %s",
    async (status) => {
      answered(status);
      const result = await setMyTicketAction({ ticketStatus: "has_ticket" });
      expect(result.ok).toBe(false);
      expect(setMyTicketStatus).not.toHaveBeenCalled();
    },
  );
});
