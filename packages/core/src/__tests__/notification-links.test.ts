import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_FALLBACK_LINK,
  notificationLink,
} from "../notification-links";

const ACTIVATION = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";

describe("notificationLink", () => {
  it("opens the questionnaire a reminder or release is about", () => {
    expect(notificationLink("questionnaire_activation", ACTIVATION)).toBe(
      `/questionnaires/${ACTIVATION}`,
    );
  });

  it("opens the read page of an announcement", () => {
    expect(notificationLink("announcement", ACTIVATION)).toBe(
      `/announcements/${ACTIVATION}`,
    );
  });

  it("opens the task board for a task reminder", () => {
    expect(notificationLink("task", ACTIVATION)).toBe("/tasks");
  });

  it("falls back to the inbox for anything it cannot open", () => {
    for (const [type, id] of [
      ["announcement", "not-a-uuid"],
      ["announcement", null],
      ["questionnaire_activation", null],
      ["questionnaire_activation", "../../admin"],
      [null, null],
      ["something_new", ACTIVATION],
      ["task", null],
      ["task", "not-a-uuid"],
    ] as const) {
      expect(notificationLink(type, id)).toBe(NOTIFICATION_FALLBACK_LINK);
    }
  });
});
