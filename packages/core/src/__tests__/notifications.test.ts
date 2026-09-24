import { describe, expect, it } from "vitest";
import { NOTIFICATION_KINDS } from "@camp404/types";
import {
  announcementNotification,
  approvalNotification,
  captainPromotionNotification,
  kindForBroadcast,
  notificationMentionsAny,
  payloadLink,
  questionnaireReleaseNotification,
  questionnaireReminderNotification,
  releaseBody,
  reminderBody,
  taskDeadlineNotification,
} from "../notifications";

const ACTIVATION = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";
const BROADCAST = "7f5e2f7a-6f50-4c89-8df9-2f7b8f3dc31e";
const TITLE = "Camp feedback";
const TASK = "0b6c7f1e-2a4d-4c3b-8e9f-5a1d2c3b4e6f";

describe("reminderBody", () => {
  it("names the questionnaire and its deadline", () => {
    const body = reminderBody(TITLE, new Date("2026-03-10T12:00:00Z"));
    expect(body).toContain(TITLE);
    expect(body).toMatch(/due 10 Mar/);
    expect(body).toMatch(/Tap to complete\.$/);
  });

  // The deadline is read in camp time (SAST, UTC+2), never the host's zone:
  // Vercel runs in UTC, and a captain in Cape Town who picks 00:30 on 11 Mar
  // stores 22:30Z on the 10th. Two instants, one either side of each midnight,
  // so a host east of SAST fails the second case as surely as UTC fails the first.
  it("dates the deadline in camp time, not the server's time zone", () => {
    expect(reminderBody(TITLE, new Date("2026-03-10T22:30:00Z"))).toMatch(
      /due 11 Mar/,
    );
    expect(reminderBody(TITLE, new Date("2026-03-11T21:59:00Z"))).toMatch(
      /due 11 Mar/,
    );
  });

  it("says something true when the send has no deadline", () => {
    const body = reminderBody(TITLE, null);
    expect(body).toContain(TITLE);
    expect(body).not.toMatch(/due/);
    expect(body).not.toMatch(/undefined|null|Invalid/);
  });
});

describe("releaseBody", () => {
  it("says whether the questionnaire holds the app, with the deadline in camp time", () => {
    expect(releaseBody("Safety", new Date("2026-03-10T22:30:00Z"), true)).toBe(
      "New questionnaire: Safety, due 11 Mar. You need to answer it before using the app.",
    );
    expect(releaseBody("Skills", null, false)).toBe(
      "New questionnaire: Skills. Tap to answer.",
    );
  });
});

describe("payload builders", () => {
  it("point each notice at what it is about", () => {
    const announcement = announcementNotification({
      broadcastId: BROADCAST,
      title: "Burn-night briefing",
      body: "Meet at the effigy.",
    });
    expect(announcement).toEqual({
      kind: "announcement",
      title: "Burn-night briefing",
      body: "Meet at the effigy.",
      refType: "announcement",
      refId: BROADCAST,
    });
    expect(payloadLink(announcement)).toBe(`/announcements/${BROADCAST}`);

    const release = questionnaireReleaseNotification({
      activationId: ACTIVATION,
      title: TITLE,
      dueAt: null,
      blocking: false,
    });
    expect(release.kind).toBe("questionnaire_release");
    expect(release.body).toBe(releaseBody(TITLE, null, false));
    expect(payloadLink(release)).toBe(`/questionnaires/${ACTIVATION}`);

    const reminder = questionnaireReminderNotification({
      activationId: ACTIVATION,
      title: TITLE,
      dueAt: null,
    });
    expect(reminder.kind).toBe("questionnaire_reminder");
    expect(reminder.body).toBe(reminderBody(TITLE, null));
    expect(payloadLink(reminder)).toBe(`/questionnaires/${ACTIVATION}`);

    const approval = approvalNotification();
    expect(approval.kind).toBe("approval_decision");
    expect(payloadLink(approval)).toBe("/notifications");

    // The request is answered on the notifications page itself.
    const promotion = captainPromotionNotification({
      requestId: BROADCAST,
      requesterName: "Captain Jo",
    });
    expect(promotion).toMatchObject({
      kind: "captain_promotion",
      refType: "captain_promotion",
      refId: BROADCAST,
    });
    expect(promotion.body).toContain("Captain Jo asked you");
    expect(payloadLink(promotion)).toBe("/notifications");
    expect(
      captainPromotionNotification({ requestId: BROADCAST, requesterName: " " })
        .body,
    ).toMatch(/^A captain asked you/);
  });

  it("only ever produce kinds the database accepts", () => {
    const kinds = [
      announcementNotification({
        broadcastId: BROADCAST,
        title: "a",
        body: "b",
      }),
      questionnaireReleaseNotification({
        activationId: ACTIVATION,
        title: "a",
        dueAt: null,
        blocking: true,
      }),
      questionnaireReminderNotification({
        activationId: ACTIVATION,
        title: "a",
        dueAt: null,
      }),
      approvalNotification(),
      captainPromotionNotification({
        requestId: BROADCAST,
        requesterName: "Jo",
      }),
      taskDeadlineNotification({ taskId: TASK, title: "a", stage: "due_day" }),
    ].map((p) => p.kind);
    for (const kind of kinds) expect(NOTIFICATION_KINDS).toContain(kind);
  });
});

describe("taskDeadlineNotification", () => {
  it("says the task is due tomorrow, or today, and opens the task board", () => {
    const dayBefore = taskDeadlineNotification({
      taskId: TASK,
      title: "Pack the shade cloth",
      stage: "day_before",
    });
    expect(dayBefore).toEqual({
      kind: "task_reminder",
      title: "Pack the shade cloth",
      body: "Due tomorrow: Pack the shade cloth. Tap to open the task board.",
      refType: "task",
      refId: TASK,
    });
    expect(payloadLink(dayBefore)).toBe("/tasks");

    const dueDay = taskDeadlineNotification({
      taskId: TASK,
      title: "Pack the shade cloth",
      stage: "due_day",
    });
    expect(dueDay.body).toBe(
      "Due today: Pack the shade cloth. Tap to open the task board.",
    );
    expect(dueDay.kind).toBe("task_reminder");
  });
});

describe("kindForBroadcast", () => {
  it("maps each broadcast kind to what the member is told it is", () => {
    expect(kindForBroadcast("announcement", null)).toBe("announcement");
    expect(kindForBroadcast("team_message", null)).toBe("team_message");
    expect(kindForBroadcast("lead_directive", null)).toBe("lead_directive");
    expect(kindForBroadcast("reminder", "questionnaire_activation")).toBe(
      "questionnaire_reminder",
    );
    expect(kindForBroadcast("system", "questionnaire_activation")).toBe(
      "questionnaire_release",
    );
    expect(kindForBroadcast("system", null)).toBe("announcement");
  });
});

// A builder takes only display-level facts, so it cannot leak a private
// value. These prove it for every builder, with the secrets this camp actually
// holds, and prove the guard itself can say yes.
describe("notificationMentionsAny", () => {
  const SECRETS = [
    "8001015009087", // SA ID number
    "A12345678", // passport number
    "+27821234567", // phone
    "082 123 4567", // phone, as typed
    "Thandi Mokoena", // emergency contact
    "ada@example.com", // email
    "Penicillin", // medical
  ];

  it("finds a secret that is there (the guard is not vacuous)", () => {
    const leaky = {
      ...approvalNotification(),
      title: "Your phone +27821234567 was updated",
    };
    expect(notificationMentionsAny(leaky, SECRETS)).toBe(true);
    expect(
      notificationMentionsAny(
        { ...approvalNotification(), body: "Allergic to PENICILLIN" },
        SECRETS,
      ),
    ).toBe(true);
  });

  it("ignores blank needles instead of matching everything", () => {
    expect(notificationMentionsAny(approvalNotification(), ["", "   "])).toBe(
      false,
    );
  });

  it("finds no secret in any builder's payload", () => {
    const payloads = [
      announcementNotification({
        broadcastId: BROADCAST,
        title: "Burn-night briefing",
        body: "Meet at the effigy at 20:00.",
      }),
      questionnaireReleaseNotification({
        activationId: ACTIVATION,
        title: TITLE,
        dueAt: new Date("2026-03-10T22:30:00Z"),
        blocking: true,
      }),
      questionnaireReminderNotification({
        activationId: ACTIVATION,
        title: TITLE,
        dueAt: new Date("2026-03-10T22:30:00Z"),
      }),
      approvalNotification(),
      captainPromotionNotification({
        requestId: BROADCAST,
        requesterName: "Captain Jo",
      }),
      taskDeadlineNotification({
        taskId: TASK,
        title: "Pack the shade cloth",
        stage: "day_before",
      }),
      taskDeadlineNotification({
        taskId: TASK,
        title: "Pack the shade cloth",
        stage: "due_day",
      }),
    ];
    for (const payload of payloads) {
      expect(notificationMentionsAny(payload, SECRETS)).toBe(false);
    }
  });
});
