import { describe, expect, it } from "vitest";
import { parseSendPrefill } from "../prefill";

// The query string only pre-fills; it authorises nothing. So the parse is
// strict about shape and silent about anything it doesn't recognise.

describe("parseSendPrefill", () => {
  it("reads every choice the editor can hand over", () => {
    expect(
      parseSendPrefill({
        audience: "team:kitchen",
        blocking: "1",
        due: "2027-03-01",
      }),
    ).toEqual({
      audience: { scope: "team", team: "kitchen" },
      blocking: true,
      // A date alone is due at the end of that day.
      dueAt: "2027-03-01T23:59",
    });
    expect(parseSendPrefill({ audience: "team_leads" }).audience).toEqual({
      scope: "team_leads",
    });
    expect(parseSendPrefill({ due: "2027-03-01T08:30" }).dueAt).toBe(
      "2027-03-01T08:30",
    );
  });

  it("pre-fills nothing it doesn't recognise", () => {
    expect(
      parseSendPrefill({
        audience: "opt_in",
        blocking: "yes",
        due: "next tuesday",
      }),
    ).toEqual({ audience: null, blocking: false, dueAt: undefined });
    expect(parseSendPrefill({ audience: "team:" }).audience).toBeNull();
    expect(parseSendPrefill({ audience: "team:<script>" }).audience).toBeNull();
    expect(parseSendPrefill({})).toEqual({
      audience: null,
      blocking: false,
      dueAt: undefined,
    });
  });

  it("takes the first of a repeated parameter", () => {
    expect(
      parseSendPrefill({ audience: ["everyone", "team:kitchen"] }).audience,
    ).toEqual({ scope: "everyone" });
  });
});
