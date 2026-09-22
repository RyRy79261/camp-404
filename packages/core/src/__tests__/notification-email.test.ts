import { describe, expect, it } from "vitest";
import { NOTIFICATION_KINDS } from "@camp404/types";
import {
  renderNotificationEmail,
  shouldEmailNotification,
} from "../notification-email";
import {
  announcementNotification,
  approvalNotification,
  notificationMentionsAny,
  questionnaireReleaseNotification,
} from "../notifications";

const ID = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";

describe("shouldEmailNotification", () => {
  it("emails only what a member must not miss", () => {
    expect(shouldEmailNotification("announcement", "acknowledge")).toBe(true);
    expect(shouldEmailNotification("announcement", "popup")).toBe(false);
    expect(shouldEmailNotification("announcement", "feed")).toBe(false);
    for (const kind of [
      "questionnaire_release",
      "questionnaire_reminder",
      "approval_decision",
      "captain_promotion",
    ] as const) {
      expect(shouldEmailNotification(kind, "feed")).toBe(true);
    }
    expect(shouldEmailNotification("team_message", "acknowledge")).toBe(false);
    expect(shouldEmailNotification("lead_directive", "popup")).toBe(false);
  });

  it("has an answer for every kind", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(typeof shouldEmailNotification(kind, "feed")).toBe("boolean");
    }
  });
});

describe("renderNotificationEmail", () => {
  it("carries the notice and an absolute link to it", () => {
    const email = renderNotificationEmail(
      questionnaireReleaseNotification({
        activationId: ID,
        title: "Camp feedback",
        dueAt: null,
        blocking: false,
      }),
      "https://camp-404.com",
    );
    expect(email.subject).toBe("Camp 404: Camp feedback");
    expect(email.text).toContain("New questionnaire: Camp feedback");
    expect(email.text).toContain(`https://camp-404.com/questionnaires/${ID}`);
    expect(email.html).toContain(
      `href="https://camp-404.com/questionnaires/${ID}"`,
    );
  });

  it("escapes what a captain wrote, so it cannot inject markup", () => {
    const email = renderNotificationEmail(
      announcementNotification({
        broadcastId: ID,
        title: 'Burn <script>alert("x")</script>',
        body: "Bring <b>water</b> & shade",
      }),
      "https://camp-404.com",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>water</b>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("water&lt;/b&gt; &amp; shade");
    // The plain-text part is the text as written.
    expect(email.text).toContain("Bring <b>water</b> & shade");
  });

  it("sends the markdown a captain wrote as plain words, not markers", () => {
    const email = renderNotificationEmail(
      announcementNotification({
        broadcastId: ID,
        title: "Burn night briefing",
        body: [
          "## Burn night",
          "",
          "**Everyone** meets at *20:00*.",
          "",
          "- Bring [water](https://camp-404.com/water)",
        ].join("\n"),
      }),
      "https://camp-404.com",
    );
    // Neither part of an email renders markdown: the text part has no
    // renderer, and the HTML part escapes what it is handed.
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Burn night");
      expect(part).toContain("Everyone meets at 20:00.");
      expect(part).toContain("Bring water");
      expect(part).not.toContain("**");
      expect(part).not.toContain("## ");
      expect(part).not.toContain("](https://camp-404.com/water)");
    }
  });

  it("links a notice about nothing else to the inbox, and carries no secret", () => {
    const email = renderNotificationEmail(
      approvalNotification(),
      "https://camp-404.com",
    );
    expect(email.text).toContain("https://camp-404.com/notifications");
    expect(
      notificationMentionsAny({ ...approvalNotification(), body: email.text }, [
        "8001015009087",
        "+27821234567",
      ]),
    ).toBe(false);
  });
});
