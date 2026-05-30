import { describe, it, expect } from "vitest";
import { isAuthorizedCron } from "../cron-auth";

describe("isAuthorizedCron", () => {
  it("fails closed when the secret is unset or empty", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer anything", undefined)).toBe(false);
  });

  it("rejects a missing, malformed, or wrong header", () => {
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer nope", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false); // no "Bearer "
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false); // length differs
  });

  it("accepts the correct bearer token", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });
});
