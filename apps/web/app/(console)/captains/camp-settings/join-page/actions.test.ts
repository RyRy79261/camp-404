import { beforeEach, describe, expect, it, vi } from "vitest";

// The join page's actions: captains only, the boundary parse, and the actor's
// own id passed to the write (never anything from the caller).

vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/join-page", () => ({
  saveJoinPage: vi.fn(),
  unpublishJoinPage: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveJoinPageAction, unpublishJoinPageAction } from "./actions";
import { captainActionGate } from "@/lib/captain-gate";
import { saveJoinPage, unpublishJoinPage } from "@/lib/join-page";
import { revalidatePath } from "next/cache";

describe("join page actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: "cap-1" },
      rank: "captain",
    } as never);
    vi.mocked(saveJoinPage).mockResolvedValue({
      ok: true,
      version: 2,
      cycle: 2026,
    });
    vi.mocked(unpublishJoinPage).mockResolvedValue({ ok: true, version: 3 });
  });

  it("saves as the signed-in captain, gated at captain", async () => {
    const result = await saveJoinPageAction({
      markdown: "Hello",
      expectedVersion: 1,
      publish: true,
    });
    expect(result).toEqual({ ok: true, data: { version: 2 } });
    expect(captainActionGate).toHaveBeenCalledWith("captain");
    expect(saveJoinPage).toHaveBeenCalledWith({
      actorId: "cap-1",
      markdown: "Hello",
      expectedVersion: 1,
      publish: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/captains/camp-settings/join-page",
    );
  });

  it("refuses anyone the gate refuses, and writes nothing", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    expect(
      await saveJoinPageAction({
        markdown: "Hello",
        expectedVersion: 0,
        publish: false,
      }),
    ).toEqual({ ok: false, error: "Captain access only." });
    expect(await unpublishJoinPageAction(1)).toEqual({
      ok: false,
      error: "Captain access only.",
    });
    expect(saveJoinPage).not.toHaveBeenCalled();
    expect(unpublishJoinPage).not.toHaveBeenCalled();
  });

  it("refuses a page over the limit before the write", async () => {
    const result = await saveJoinPageAction({
      markdown: "x".repeat(50_001),
      expectedVersion: 0,
      publish: false,
    });
    expect(result).toEqual({
      ok: false,
      error:
        "The page is longer than 50,000 characters. Shorten it and try again.",
    });
    expect(saveJoinPage).not.toHaveBeenCalled();
  });

  it("drops anything extra the caller sends", async () => {
    await saveJoinPageAction({
      markdown: "Hi",
      expectedVersion: 0,
      publish: false,
      actorId: "someone-else",
    } as never);
    expect(vi.mocked(saveJoinPage).mock.calls[0]![0].actorId).toBe("cap-1");
  });

  it("passes on the write's own refusal as a sentence", async () => {
    vi.mocked(saveJoinPage).mockResolvedValue({
      ok: false,
      error: "Someone changed the join page first.",
    });
    expect(
      await saveJoinPageAction({
        markdown: "Hi",
        expectedVersion: 1,
        publish: false,
      }),
    ).toEqual({ ok: false, error: "Someone changed the join page first." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("takes the page down as the signed-in captain", async () => {
    expect(await unpublishJoinPageAction(2)).toEqual({
      ok: true,
      data: { version: 3 },
    });
    expect(unpublishJoinPage).toHaveBeenCalledWith({
      actorId: "cap-1",
      expectedVersion: 2,
    });
  });

  it("refuses a version that cannot be published", async () => {
    expect(await unpublishJoinPageAction(0)).toEqual({
      ok: false,
      error: "The join page is not published.",
    });
    expect(unpublishJoinPage).not.toHaveBeenCalled();
  });
});
