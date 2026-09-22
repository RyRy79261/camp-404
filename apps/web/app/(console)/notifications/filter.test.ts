import { describe, expect, it } from "vitest";
import {
  INBOX_TAB_ORDER,
  marksPageRead,
  notificationsHref,
  parseInboxFilter,
} from "./filter";

// The inbox tab vocabulary. Small, but the two rules it carries are the ones
// that break the surface: a stale `?filter=` must still open the inbox, and the
// Unread tab must not mark its own page read.

describe("parseInboxFilter", () => {
  it("keeps a tab it knows", () => {
    for (const tab of INBOX_TAB_ORDER) {
      expect(parseInboxFilter(tab)).toBe(tab);
    }
  });

  it("falls back to the whole inbox for anything else", () => {
    for (const junk of [undefined, "", "bulletins", "UNREAD", "' or 1=1 --"]) {
      expect(parseInboxFilter(junk)).toBe("all");
    }
  });
});

describe("notificationsHref", () => {
  it("leaves the default tab's URL clean and names the others", () => {
    expect(notificationsHref("all")).toBe("/notifications");
    expect(notificationsHref("unread")).toBe("/notifications?filter=unread");
    expect(notificationsHref("announcements")).toBe(
      "/notifications?filter=announcements",
    );
  });
});

describe("marksPageRead", () => {
  it("does not clear the Unread tab under the member reading it", () => {
    expect(marksPageRead("unread")).toBe(false);
  });

  it("keeps Camp 404's clear-on-open behaviour everywhere else", () => {
    expect(marksPageRead("all")).toBe(true);
    expect(marksPageRead("announcements")).toBe(true);
  });
});
