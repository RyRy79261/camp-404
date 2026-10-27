import { NOTIFICATION_KINDS } from "@camp404/types";
import { describe, expect, it } from "vitest";
import { plainPreview } from "../markdown-text";
import {
  isCommandForUs,
  isPersonalNotification,
  meetingPostBody,
  OL_JEB_SAYS,
  parseBotCommand,
  renderTelegramPost,
  telegramMention,
  renderTelegramNotice,
  tagCandidateStanding,
  tagGroupCount,
  tagGroupTicks,
  type TagCandidate,
  shouldTelegramNotification,
  TELEGRAM_MESSAGE_MAX,
} from "../notification-telegram";

describe("shouldTelegramNotification", () => {
  it("sends every kind to a member who wants all notices", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldTelegramNotification(kind, "all")).toBe(true);
    }
  });

  it("sends only the notices about the member by default", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldTelegramNotification(kind, "mine")).toBe(
        isPersonalNotification(kind),
      );
    }
    expect(shouldTelegramNotification("announcement", "mine")).toBe(false);
    expect(shouldTelegramNotification("questionnaire_release", "mine")).toBe(
      false,
    );
    expect(shouldTelegramNotification("team_message", "mine")).toBe(false);
    expect(shouldTelegramNotification("questionnaire_reminder", "mine")).toBe(
      true,
    );
    expect(shouldTelegramNotification("task_reminder", "mine")).toBe(true);
    expect(shouldTelegramNotification("approval_decision", "mine")).toBe(true);
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

describe("/notifyhere", () => {
  it("reads the command and the bot it names", () => {
    expect(parseBotCommand("/notifyhere")).toEqual({
      command: "notifyhere",
      bot: null,
    });
    expect(parseBotCommand("/notifyhere@Jebediah_404_bot")).toEqual({
      command: "notifyhere",
      bot: "Jebediah_404_bot",
    });
  });

  it("is for Ol' Jeb with no name or his own, never another bot's", () => {
    expect(isCommandForUs(null, "jebediah_404_bot")).toBe(true);
    expect(isCommandForUs("JEBEDIAH_404_BOT", "jebediah_404_bot")).toBe(true);
    expect(isCommandForUs("other_bot", "jebediah_404_bot")).toBe(false);
    expect(isCommandForUs("jebediah_404_bot", null)).toBe(false);
  });
});

describe("telegramMention", () => {
  it("tags only a username Telegram allows", () => {
    expect(telegramMention("cloud_404")).toBe("@cloud_404");
    expect(telegramMention(" @@cloud_404 ")).toBe("@cloud_404");
    expect(telegramMention("abcd")).toBeNull();
    expect(telegramMention("4cloud")).toBeNull();
    expect(telegramMention("cloud 404")).toBeNull();
    expect(telegramMention("cloud\n@everyone")).toBeNull();
    expect(telegramMention(null)).toBeNull();
  });
});

describe("renderTelegramPost", () => {
  const base = {
    title: "Form due Friday: Coming this year?",
    body: "Please **answer** by Friday.",
    buttonText: "Answer in Camp 404",
    buttonPath: "/questionnaires/abc",
  };

  it("tags who still owes a reminder and counts who has no username", () => {
    const post = renderTelegramPost(
      {
        ...base,
        kind: "reminder",
        tags: ["@cloud_404", "@mike_404"],
        untagged: 2,
      },
      "https://camp-404.com/",
    );
    expect(post.text).toBe(
      "Form due Friday: Coming this year?\n\nPlease answer by Friday.\n\nStill to answer: @cloud_404 @mike_404 and 2 more without a Telegram username.",
    );
    expect(post.button).toEqual({
      text: "Answer in Camp 404",
      url: "https://camp-404.com/questionnaires/abc",
    });
  });

  it("says how many when nobody has a username, and tags only reminders", () => {
    expect(
      renderTelegramPost(
        { ...base, kind: "reminder", tags: [], untagged: 1 },
        "https://camp-404.com",
      ).text,
    ).toContain("Still to answer: 1 person without a Telegram username.");
    expect(
      renderTelegramPost(
        { ...base, kind: "announcement", tags: ["@cloud_404"], untagged: 3 },
        "https://camp-404.com",
      ).text,
    ).not.toContain("Still to answer");
  });
});

describe("meetingPostBody", () => {
  it("says the day, the time and the team", () => {
    expect(
      meetingPostBody({
        allDay: false,
        startDate: "2026-11-02",
        endDate: "2026-11-02",
        startTime: "18:00",
        teamLabel: "Structures",
      }),
    ).toBe("Mon 2 Nov, 18:00 GMT+2 · Structures team");
    expect(
      meetingPostBody({
        allDay: true,
        startDate: "2026-11-02",
        endDate: "2026-11-04",
        startTime: null,
        teamLabel: null,
      }),
    ).toBe("Mon 2 Nov to Wed 4 Nov · Whole camp");
  });

  it("says a team-leads meeting is for the team leads, not the whole camp", () => {
    expect(
      meetingPostBody({
        allDay: false,
        startDate: "2026-10-27",
        endDate: "2026-10-27",
        startTime: "21:00",
        teamLabel: null,
        audience: "team_leads",
      }),
    ).toBe("Tue 27 Oct, 21:00 GMT+2 · Team leads");
  });
});

describe("Post in Telegram: who a chip ticks", () => {
  const c = (userId: string, over: Partial<TagCandidate> = {}) => ({
    userId,
    name: userId,
    intent: null,
    status: null,
    mention: `@${userId}_404`,
    connected: false,
    ...over,
  });
  const list = [
    c("noanswer"),
    c("coming", { intent: "yes", status: "applied" }),
    c("accepted", { intent: "maybe", status: "accepted" }),
    c("maybe", { intent: "maybe", status: "maybe" }),
    c("nohandle", { intent: "yes", status: "applied", mention: null }),
    c("dm", { intent: "yes", status: "applied", connected: true }),
  ] as const;

  it("counts everyone in a chip's group", () => {
    expect(tagGroupCount(list, "pending")).toBe(6);
    expect(tagGroupCount(list, "coming")).toBe(4);
    expect(tagGroupCount(list, "maybe")).toBe(2);
    expect(tagGroupCount(list, "nobody")).toBe(0);
  });

  it("ticks only who can be tagged and has not connected", () => {
    expect([...tagGroupTicks(list, "pending")].sort()).toEqual([
      "accepted",
      "coming",
      "maybe",
      "noanswer",
    ]);
    expect([...tagGroupTicks(list, "coming")].sort()).toEqual([
      "accepted",
      "coming",
    ]);
    expect([...tagGroupTicks(list, "maybe")].sort()).toEqual([
      "accepted",
      "maybe",
    ]);
    expect(tagGroupTicks(list, "nobody").size).toBe(0);
  });

  it("says what each member said, never the captains' decision", () => {
    expect(tagCandidateStanding(list[0])).toBe("No answer yet");
    expect(tagCandidateStanding(list[2])).toBe("Maybe");
    expect(tagCandidateStanding(list[1])).toBe("Coming");
  });
});

describe("renderTelegramPost: a questionnaire posted by hand", () => {
  const base = {
    kind: "questionnaire" as const,
    title: "Coming this year?",
    body: "Tell us if you're coming.",
    buttonText: "Answer in Camp 404",
    buttonPath: "/questionnaires/x",
  };

  it("ends with every tag", () => {
    const post = renderTelegramPost(
      { ...base, tags: ["@a_404", "@b_404"] },
      "https://camp-404.com",
    );
    expect(post.text).toBe(
      "Coming this year?\n\nTell us if you're coming.\n\n@a_404 @b_404, this one's for you.",
    );
    expect(post.more).toBeUndefined();
    expect(post.button?.url).toBe("https://camp-404.com/questionnaires/x");
  });

  it("posts with no tag line when nobody is tagged", () => {
    expect(renderTelegramPost(base, "https://camp-404.com").text).toBe(
      "Coming this year?\n\nTell us if you're coming.",
    );
  });

  it("sends every tag, in more messages past Telegram's limit", () => {
    const tags = Array.from(
      { length: 400 },
      (_, i) => `@member_${String(i).padStart(4, "0")}`,
    );
    const post = renderTelegramPost({ ...base, tags }, "https://camp-404.com");
    const all = [post.text, ...(post.more ?? [])];
    for (const text of all) expect(text.length).toBeLessThanOrEqual(4096);
    expect(post.more?.length).toBeGreaterThan(0);
    const sent = all.join(" ");
    for (const tag of tags) expect(sent).toContain(tag);
    expect(all.at(-1)!.endsWith(", this one's for you.")).toBe(true);
  });
});
