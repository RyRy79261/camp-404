import { describe, expect, it } from "vitest";

import { redactPii, sanitizeReportText } from "../text-redaction";

describe("redactPii", () => {
  it("redacts emails, phone numbers, ID and card numbers", () => {
    const out = redactPii(
      "reach me at jane@example.com or +27 82 555 1234, ID 8001015009087, card 4111 1111 1111 1111",
    );
    expect(out).not.toContain("jane@example.com");
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[id]");
    expect(out).toContain("[card]");
  });

  it("fully redacts international phone numbers — no trailing digit group leaks", () => {
    for (const n of [
      "+27 82 555 1234",
      "+1 415 555 2671",
      "+44 20 7946 0958",
      "+49-123-4567890",
    ]) {
      expect(redactPii(n)).toBe("[phone]");
    }
  });

  it("redacts space-separated local phone numbers", () => {
    expect(redactPii("082 555 1234")).toBe("[phone]");
    expect(redactPii("call 082 555 1234 please")).toContain("[phone]");
  });

  it("redacts secrets: bearer tokens, JWTs, API keys, and token-bearing URLs", () => {
    expect(redactPii("Authorization: Bearer abc.def-123")).toContain(
      "Bearer [token]",
    );
    expect(
      redactPii("token eyJhbGciOiJ.eyJzdWIiOiI.SflKxwRJ0eK"),
    ).toContain("[jwt]");
    expect(redactPii("key sk-livedeadbeef0123456789")).toContain("[secret]");
    expect(
      redactPii("ghp_0123456789abcdef0123456789abcdef"),
    ).toContain("[secret]");
    const url = redactPii("see https://x.io/d?token=supersecretvalue123");
    expect(url).not.toContain("supersecretvalue123");
    expect(url).toContain("[redacted]");
  });
});

describe("sanitizeReportText", () => {
  it("strips HTML tags and trims", () => {
    expect(sanitizeReportText("  <script>alert(1)</script>hello  ", 100)).toBe(
      "alert(1)hello",
    );
  });

  it("caps length", () => {
    expect(sanitizeReportText("a".repeat(50), 10)).toHaveLength(10);
  });
});
