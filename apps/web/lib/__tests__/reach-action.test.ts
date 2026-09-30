import { describe, expect, it } from "vitest";
import { reached, UNREACHABLE } from "../reach-action";

describe("reached", () => {
  it("passes an action's own result through", async () => {
    expect(await reached(Promise.resolve({ ok: true }))).toEqual({ ok: true });
    expect(
      await reached(Promise.resolve({ ok: false, error: "Nope" })),
    ).toEqual({ ok: false, error: "Nope" });
  });

  it("turns a call that throws into a sentence, not the error screen", async () => {
    expect(
      await reached(Promise.reject(new TypeError("fetch failed"))),
    ).toEqual({ ok: false, error: UNREACHABLE });
  });
});
