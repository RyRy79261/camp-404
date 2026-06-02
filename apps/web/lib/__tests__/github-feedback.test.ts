import { describe, expect, it } from "vitest";
import { buildFeedbackIssue, labelsFor } from "@/lib/github-feedback";

describe("labelsFor", () => {
  it("maps kind to provenance-tagged labels", () => {
    expect(labelsFor("bug")).toEqual(["bug", "from-app"]);
    expect(labelsFor("feature")).toEqual(["enhancement", "from-app"]);
  });
});

describe("buildFeedbackIssue", () => {
  it("derives the title from the first line and embeds the opaque reporter ref + route", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "Publish button does nothing\nSteps: tap publish, nothing happens",
      dictated: false,
      reporterRef: "camp-user-123",
      route: "/captains/announcements",
    });
    expect(issue.title).toBe("Publish button does nothing");
    expect(issue.labels).toEqual(["bug", "from-app"]);
    expect(issue.body).toContain("Publish button does nothing");
    expect(issue.body).toContain("camp-user-123");
    expect(issue.body).toContain("/captains/announcements");
  });

  it("redacts PII in the description before it reaches the public issue body", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "email me at jane@example.com when fixed",
      dictated: false,
      reporterRef: "camp-user-123",
    });
    expect(issue.body).not.toContain("jane@example.com");
    expect(issue.body).toContain("[email]");
  });

  it("notes voice dictation and falls back to a default title when empty", () => {
    const issue = buildFeedbackIssue({
      kind: "feature",
      description: "   ",
      dictated: true,
      reporterRef: "camp-user-123",
    });
    expect(issue.title).toBe("Feature request");
    expect(issue.body).toContain("voice-dictated");
  });

  it("escapes backtick fences so user content can't break out of the code block", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "broken\n```\nmalicious\n``` after",
      dictated: false,
      reporterRef: "camp-user-123",
    });
    // Only the two fences fenced() adds should remain.
    expect(issue.body.match(/```/g) ?? []).toHaveLength(2);
  });

  it("truncates the title to 100 chars", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      // Spaced words (not a single long token, which would be redacted as an
      // opaque blob) so we exercise title truncation, not redaction.
      description: "really ".repeat(30),
      dictated: false,
      reporterRef: "camp-user-123",
    });
    expect(issue.title).toHaveLength(100);
  });

  it("builds a structured body from an AI report and re-sanitizes its fields", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "raw text",
      dictated: false,
      reporterRef: "camp-user-123",
      structured: {
        title: "Publish fails silently",
        summary: "Tapping publish does nothing; mail me at jane@example.com",
        stepsToReproduce: ["Open announcements", "Tap publish"],
        expected: "An announcement is published",
        actual: "Nothing happens",
        severity: "high",
      },
    });
    expect(issue.title).toBe("Publish fails silently");
    expect(issue.body).toContain("## Steps to reproduce");
    expect(issue.body).toContain("1. Open announcements");
    expect(issue.body).toContain("## Expected");
    expect(issue.body).toContain("## Actual");
    expect(issue.body).toContain("Severity hint: high");
    // The model can echo PII from the raw text — structured fields are re-sanitized.
    expect(issue.body).not.toContain("jane@example.com");
    expect(issue.body).toContain("[email]");
  });

  it("neutralizes Markdown injection in AI-structured fields", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "raw",
      dictated: false,
      reporterRef: "camp-user-123",
      structured: {
        title: "T",
        summary: "Line one\n## Fake heading\n```\ninjected\n```",
        expected: "ok",
      },
    });
    // Fences are defused and the injected heading is no longer at a line start.
    expect(issue.body).not.toContain("```");
    const lines = issue.body.split("\n");
    expect(lines.some((l) => l.startsWith("## Fake heading"))).toBe(false);
    // Our own trusted section heading still renders.
    expect(issue.body).toContain("## Expected");
  });

  it("neutralizes backticks/newlines in footer values (no inline-code breakout)", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "broken",
      dictated: false,
      reporterRef: "camp`1",
      route: "/x`y\nz",
    });
    expect(issue.body).toContain("reporter: `camp1`");
    expect(issue.body).toContain("from: `/xy z`");
    expect(issue.body).not.toContain("camp`1");
  });

  it("sanitizes PII/HTML in the route before it reaches the footer", () => {
    const issue = buildFeedbackIssue({
      kind: "bug",
      description: "broken",
      dictated: false,
      reporterRef: "camp-user-123",
      route: "/u/jane@example.com/<b>x</b>",
    });
    expect(issue.body).not.toContain("jane@example.com");
    expect(issue.body).not.toContain("<b>");
    expect(issue.body).toContain("[email]");
  });
});
