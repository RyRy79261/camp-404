import { beforeEach, describe, expect, it, vi } from "vitest";

// The join-site editor holds a captain's unsaved text. A database error on
// Save must come back as a sentence the editor shows beside it, never as a
// throw to the error boundary, which would replace the page and lose the text.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/join-site", () => {
  class JoinSectionInvalidError extends Error {
    constructor(
      readonly issues: string[],
      readonly section?: string,
    ) {
      super(issues.join(" "));
    }
  }
  return {
    JoinSectionInvalidError,
    describeTeam: vi.fn(),
    getJoinEditorData: vi.fn(),
    saveJoinSections: vi.fn(),
    setBurnDates: vi.fn(),
  };
});

import { saveJoinPageAction } from "./actions";
import { captainActionGate } from "@/lib/captain-gate";
import {
  getJoinEditorData,
  JoinSectionInvalidError,
  saveJoinSections,
} from "@/lib/join-site";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "cap-1" },
    rank: "captain",
  } as never);
  vi.mocked(getJoinEditorData).mockResolvedValue({
    year: 2027,
    yearIsSet: true,
    teams: [],
  } as never);
});

describe("saveJoinPageAction", () => {
  it("keeps a section's own sentence when the section is invalid", async () => {
    vi.mocked(saveJoinSections).mockRejectedValue(
      new JoinSectionInvalidError(["Give the page a title."], "readme"),
    );
    expect(await saveJoinPageAction({ sections: { readme: {} } })).toEqual({
      ok: false,
      error: "Give the page a title.",
      section: "readme",
    });
  });

  it("turns a database error into a sentence, never a throw", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveJoinSections).mockRejectedValue(
      new Error("Failed query", {
        cause: new Error('relation "join_site_sections" does not exist'),
      }),
    );
    expect(await saveJoinPageAction({ sections: { readme: {} } })).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
