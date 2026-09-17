import { describe, expect, it } from "vitest";
import { appendTranscript } from "./transcript";

describe("appendTranscript", () => {
  it("leaves the body unchanged for an empty / whitespace addition", () => {
    expect(appendTranscript("hello", "   ", 5000)).toBe("hello");
    expect(appendTranscript("hello", "", 5000)).toBe("hello");
  });

  it("uses the trimmed addition alone when the body is empty", () => {
    expect(appendTranscript("", "  spoken words ", 5000)).toBe("spoken words");
  });

  it("newline-joins the addition onto existing text", () => {
    expect(appendTranscript("first", "second", 5000)).toBe("first\nsecond");
  });

  it("does not double up when the body already ends in a newline", () => {
    expect(appendTranscript("first\n", "second", 5000)).toBe("first\nsecond");
  });

  it("clamps the combined text to maxLength", () => {
    const body = "a".repeat(4998);
    const result = appendTranscript(body, "bcd", 5000);
    expect(result).toHaveLength(5000);
    expect(result.startsWith(body)).toBe(true);
  });
});
