import { describe, it, expect } from "vitest";
import { nextGate, requiredActionName } from "../required-actions";

describe("nextGate", () => {
  it("returns null when nothing is pending", () => {
    expect(nextGate([])).toBeNull();
  });

  it("routes a pending blocking burner_profile to the questionnaire", () => {
    expect(nextGate([{ actionKey: "burner_profile", blocking: true }])).toBe(
      "/onboarding/questionnaire",
    );
  });

  it("skips non-blocking actions", () => {
    expect(
      nextGate([{ actionKey: "burner_profile", blocking: false }]),
    ).toBeNull();
  });

  it("skips actions with no mapped route (page not built yet)", () => {
    expect(
      nextGate([{ actionKey: "dietary_requirements", blocking: true }]),
    ).toBeNull();
  });

  it("returns the first mapped blocking action, in order", () => {
    expect(
      nextGate([
        { actionKey: "dietary_requirements", blocking: true }, // no route → skip
        { actionKey: "burner_profile", blocking: true },
      ]),
    ).toBe("/onboarding/questionnaire");
  });

  it("routes a builder questionnaire (type + activationId) to the generic runner", () => {
    expect(
      nextGate([
        {
          actionKey: "def_abc",
          blocking: true,
          type: "questionnaire",
          activationId: "act-1",
        },
      ]),
    ).toBe("/questionnaires/act-1");
  });

  it("skips a questionnaire action with no activationId (never strands)", () => {
    expect(
      nextGate([
        { actionKey: "def_abc", blocking: true, type: "questionnaire" },
      ]),
    ).toBeNull();
  });

  it("honours oldest-first across static and dynamic routes", () => {
    expect(
      nextGate([
        {
          actionKey: "def_abc",
          blocking: true,
          type: "questionnaire",
          activationId: "act-1",
        },
        { actionKey: "burner_profile", blocking: true },
      ]),
    ).toBe("/questionnaires/act-1");
  });
});

describe("requiredActionName", () => {
  it("gives a code questionnaire its captain-facing name", () => {
    expect(
      requiredActionName("burner_profile", "Complete your burner profile"),
    ).toBe("Burner profile");
  });

  it("uses a builder questionnaire's stored title", () => {
    expect(requiredActionName("def_abc", "Dietary questionnaire")).toBe(
      "Dietary questionnaire",
    );
  });

  it("does not mistake a key named after an object property for a name", () => {
    expect(requiredActionName("constructor", "Tent survey")).toBe(
      "Tent survey",
    );
  });
});
