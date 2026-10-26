import { NOTIFICATION_KINDS } from "@camp404/types";
import { describe, expect, it } from "vitest";
import { plainPreview } from "../markdown-text";
import { shouldEmailNotification } from "../notification-email";
import {
  OL_JEB_SAYS,
  parseBotCommand,
  renderTelegramNotice,
  shouldTelegramNotification,
  TELEGRAM_MESSAGE_MAX,
} from "../notification-telegram";

describe("shouldTelegramNotification", () => {
  it("sends every kind to a member who wants all notices", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldTelegramNotification(kind, "feed", "all")).toBe(true);
    }
  });

  it("sends only the email list to a member who wants the important ones", () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const presentation of ["acknowledge", "popup", "feed"] as const) {
        expect(
          shouldTelegramNotification(kind, presentation, "important"),
        ).toBe(shouldEmailNotification(kind, presentation));
      }
    }
    expect(
      shouldTelegramNotification("team_message", "feed", "important"),
    ).toBe(false);
    expect(
      shouldTelegramNotification("questionnaire_reminder", "feed", "important"),
    ).toBe(true);
  });
});

describe("renderTelegramNotice", () => {
  it("carries exactly what push shows: the title and the plain body", () => {
    const body = "**Water** is *not* provided.\n\nBring 5 litres a day.";
    const notice = renderTelegramNotice(
      { title: "Form due Friday", body, refType: null, refId: null },
      "https://camp-404.com/",
    );
    // Push sends { title, body: plainPreview(body) }: nothing more here.
    expect(notice.text).toBe(`Form due Friday\n\n${plainPreview(body)}`);
    expect(notice.text).not.toContain("**");
  });

  it("links the button to the notice in the app", () => {
    const notice = renderTelegramNotice(
      { title: "T", body: "", refType: null, refId: null },
      "https://camp-404.com/",
    );
    expect(notice.text).toBe("T");
    expect(notice.url).toMatch(/^https:\/\/camp-404\.com\//);
    expect(notice.url.slice("https://".length)).not.toContain("//");
  });

  it("keeps a long notice under Telegram's limit", () => {
    const notice = renderTelegramNotice(
      { title: "T", body: "x ".repeat(5000), refType: null, refId: null },
      "https://camp-404.com",
    );
    expect(notice.text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX);
    expect(notice.text.endsWith("…")).toBe(true);
  });
});

describe("parseBotCommand", () => {
  it("reads /start with a code, with or without the bot's name", () => {
    expect(parseBotCommand("/start abc_123-X")).toEqual({
      command: "start",
      code: "abc_123-X",
    });
    expect(parseBotCommand("/start@jebediah_404_bot abc")).toEqual({
      command: "start",
      code: "abc",
    });
  });

  it("reads /start with no code", () => {
    expect(parseBotCommand("/start")).toEqual({ command: "start", code: null });
  });

  it("reads /stop", () => {
    expect(parseBotCommand("/stop")).toEqual({ command: "stop" });
    expect(parseBotCommand("/STOP@jebediah_404_bot")).toEqual({
      command: "stop",
    });
  });

  it("treats anything else as other", () => {
    expect(parseBotCommand("hello")).toEqual({ command: "other" });
    expect(parseBotCommand(undefined)).toEqual({ command: "other" });
    expect(parseBotCommand("/start a b")).toEqual({ command: "other" });
    expect(parseBotCommand("/help")).toEqual({ command: "other" });
  });
});

describe("OL_JEB_SAYS", () => {
  it("greets by first name, and without one", () => {
    expect(OL_JEB_SAYS.connected("Cloud")).toBe(
      "Hey Cloud, you're all set. Your camp notices will land here now.",
    );
    expect(OL_JEB_SAYS.connected(undefined)).toBe(
      "Hey, you're all set. Your camp notices will land here now.",
    );
  });
});
