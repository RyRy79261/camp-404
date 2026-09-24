import { beforeEach, describe, expect, it, vi } from "vitest";

// The member's own "Coming this year?" form, through the real registry entry:
// saveFormReplay validates against the fixed Yes / Maybe / No question, diffs
// against the stored answer, and hands the answer and its change-log entry to
// one saveAttendanceAnswer call.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
  getBurnerProfile: vi.fn(),
  getEmergencyContacts: vi.fn(),
  getIdDocuments: vi.fn(),
  saveBurnerProfileReplay: vi.fn(),
}));
vi.mock("@/lib/participations", () => ({
  getMyParticipation: vi.fn(),
  saveAttendanceAnswer: vi.fn(),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForPicker: vi.fn(),
  getQuestionnaireForResponses: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-edits", () => ({
  listQuestionnaireEdits: vi.fn(),
  recordQuestionnaireEdit: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-responses", () => ({
  listCompletedQuestionnaireAnswers: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ATTENDANCE_QUESTION_PROMPT } from "@camp404/types";
import { saveFormReplay } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getMyParticipation, saveAttendanceAnswer } from "@/lib/participations";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
    displayName: "M",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "camp-1" } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(getMyParticipation).mockResolvedValue({
    cycle: 2027,
    status: "maybe",
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  });
  vi.mocked(saveAttendanceAnswer).mockResolvedValue({
    status: "applied",
    changed: true,
    withdrew: false,
  });
});

describe("saveFormReplay: attendance", () => {
  it("saves a Maybe turned Yes, with one change-log entry", async () => {
    const result = await saveFormReplay("attendance", { coming: "yes" }, true);

    expect(result).toEqual({ ok: true });
    expect(saveAttendanceAnswer).toHaveBeenCalledExactlyOnceWith({
      userId: "camp-1",
      intent: "yes",
      edit: {
        version: "1",
        editedByUserId: "camp-1",
        changes: [
          {
            fieldId: "coming",
            label: ATTENDANCE_QUESTION_PROMPT,
            from: "Maybe",
            to: "Yes, I'm coming",
          },
        ],
      },
    });
  });

  it("saves an unchanged answer with no change-log entry", async () => {
    const result = await saveFormReplay(
      "attendance",
      { coming: "maybe" },
      true,
    );

    expect(result).toEqual({ ok: true });
    expect(saveAttendanceAnswer).toHaveBeenCalledExactlyOnceWith({
      userId: "camp-1",
      intent: "maybe",
      edit: null,
    });
  });

  it("refuses a value outside Yes / Maybe / No, saving nothing", async () => {
    const result = await saveFormReplay(
      "attendance",
      { coming: "definitely" },
      true,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && Object.keys(result.errors)).toContain(
      "coming",
    );
    expect(saveAttendanceAnswer).not.toHaveBeenCalled();
  });

  it("refuses a pending applicant, as for every form", async () => {
    vi.mocked(isApproved).mockReturnValue(false);

    const result = await saveFormReplay("attendance", { coming: "yes" }, true);

    expect(result).toEqual({
      ok: false,
      errors: { _root: "Your account is still awaiting approval." },
    });
    expect(getMyParticipation).not.toHaveBeenCalled();
    expect(saveAttendanceAnswer).not.toHaveBeenCalled();
  });

  it("refuses a member with no answer this year: there is nothing to change", async () => {
    vi.mocked(getMyParticipation).mockResolvedValue(null);

    const result = await saveFormReplay("attendance", { coming: "yes" }, true);

    expect(result).toEqual({
      ok: false,
      errors: { _root: "This form hasn't been completed yet." },
    });
    expect(saveAttendanceAnswer).not.toHaveBeenCalled();
  });
});
