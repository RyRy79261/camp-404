import { describe, expect, it } from "vitest";
import { Bell, Megaphone, MessageSquare } from "lucide-react";
import { formatRelativeTime, presentationIcon } from "./presentation-meta";

describe("presentationIcon", () => {
  it("maps acknowledge → Megaphone", () => {
    expect(presentationIcon("acknowledge")).toBe(Megaphone);
  });
  it("maps popup → MessageSquare", () => {
    expect(presentationIcon("popup")).toBe(MessageSquare);
  });
  it("falls back to Bell for feed", () => {
    expect(presentationIcon("feed")).toBe(Bell);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-03T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("renders 'Just now' under a minute", () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe("Just now");
  });
  it("renders minutes", () => {
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5m ago");
  });
  it("renders hours", () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3h ago");
  });
  it("renders days", () => {
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe("2d ago");
  });
  it("falls back to the date past a week, on the camp's clock", () => {
    // 22:30 UTC on 10 Mar is 00:30 on 11 Mar in South Africa: a server in UTC
    // and a browser in New York both say 11 Mar, as the camp does.
    expect(
      formatRelativeTime(
        new Date("2026-03-10T22:30:00Z"),
        new Date("2026-04-20T12:00:00Z"),
      ),
    ).toBe("11 Mar 2026");
  });
  it("accepts an ISO string", () => {
    expect(formatRelativeTime(ago(30_000).toISOString(), now)).toBe("Just now");
  });
  it("returns '' for invalid input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
