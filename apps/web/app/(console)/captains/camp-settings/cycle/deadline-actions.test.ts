import { beforeEach, describe, expect, it, vi } from "vitest";

// The AfrikaBurn deadlines' actions (owner, 2026-09-30: captains add them).
// What matters here: only a captain gets past the gate (a lead of Transport
// and Logistics, any other lead and a member are refused before the facade
// is called); every write names the signed-in actor only; what was typed is
// checked at the boundary. The rule is checked again inside each write
// (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/logistics", () => ({
  addDeadline: vi.fn(async () => ({ ok: true, calendar: "synced" })),
  editDeadline: vi.fn(async () => ({ ok: true, calendar: "synced" })),
  setDeadlineDone: vi.fn(async () => ({ ok: true, calendar: "synced" })),
  removeDeadline: vi.fn(async () => ({ ok: true, calendar: "synced" })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import {
  addDeadline,
  editDeadline,
  removeDeadline,
  setDeadlineDone,
} from "@/lib/logistics";
import { DEADLINES_REFUSAL } from "@/lib/logistics-copy";
import {
  addDeadlineAction,
  editDeadlineAction,
  removeDeadlineAction,
  setDeadlineDoneAction,
} from "./deadline-actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];
const ID = "3f9c2a1e-8b7d-4c6e-9f10-112233445566";

function actAs(rank: ViewerRank, id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
}

describe("deadline actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a captain add, edit, tick and remove, as themselves", async () => {
    actAs("captain", "cap-1");
    expect(
      await addDeadlineAction({
        title: " DDT sale ",
        dueDate: "",
        note: "",
      }),
    ).toEqual({ ok: true, data: { calendar: "synced" } });
    expect(addDeadline).toHaveBeenCalledWith("cap-1", {
      title: "DDT sale",
      dueDate: null,
      note: null,
    });
    await editDeadlineAction({
      id: ID,
      title: "DDT sale",
      dueDate: "2027-02-01",
      expectedVersion: 1,
    });
    expect(editDeadline).toHaveBeenCalledWith(
      "cap-1",
      expect.objectContaining({ id: ID, dueDate: "2027-02-01" }),
    );
    await setDeadlineDoneAction({ id: ID, done: true, expectedVersion: 2 });
    expect(setDeadlineDone).toHaveBeenCalledWith("cap-1", {
      id: ID,
      done: true,
      expectedVersion: 2,
    });
    await removeDeadlineAction({ id: ID, expectedVersion: 3 });
    expect(removeDeadline).toHaveBeenCalledWith("cap-1", {
      id: ID,
      expectedVersion: 3,
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/captains/camp-settings/cycle",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/logistics");
  });

  it("refuses every lead and a member before anything is written", async () => {
    for (const rank of ["team_lead", "camp_member"] as const) {
      actAs(rank);
      expect(
        await addDeadlineAction({ title: "DDT sale", dueDate: "2027-02-01" }),
      ).toEqual({ ok: false, error: DEADLINES_REFUSAL });
      expect(
        await removeDeadlineAction({ id: ID, expectedVersion: 1 }),
      ).toEqual({ ok: false, error: DEADLINES_REFUSAL });
    }
    expect(addDeadline).not.toHaveBeenCalled();
    expect(removeDeadline).not.toHaveBeenCalled();
  });

  it("says what is wrong with what was typed, and writes nothing", async () => {
    actAs("captain");
    expect(await addDeadlineAction({ title: "", dueDate: "" })).toEqual({
      ok: false,
      error: "Give the deadline a title.",
    });
    expect(
      await addDeadlineAction({ title: "WAP", dueDate: "2027-02-30" }),
    ).toEqual({ ok: false, error: "Pick a real date." });
    expect(addDeadline).not.toHaveBeenCalled();
  });
});
