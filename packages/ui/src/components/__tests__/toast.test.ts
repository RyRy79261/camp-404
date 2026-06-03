import { afterEach, describe, expect, it } from "vitest";

import { getToasts, toast } from "../toast";

// Store-logic tests (node env — @camp404/ui's vitest has no DOM). The
// auto-dismiss timer lives in the <Toaster/> component and is covered by the
// story / a jsdom harness (separate infra); here we cover the imperative store:
// push, variants, dismiss(one), dismiss(all), insertion order.

afterEach(() => {
  toast.dismiss(); // clear the module store between tests
});

describe("toast store", () => {
  it("starts empty", () => {
    expect(getToasts()).toEqual([]);
  });

  it("pushes a record and returns a unique id", () => {
    const a = toast("Hello");
    const b = toast("World");
    expect(a).not.toBe(b);
    const items = getToasts();
    expect(items).toHaveLength(2);
    expect(items.map((t) => t.title)).toEqual(["Hello", "World"]); // insertion order
  });

  it("tags the variant from the helper used", () => {
    toast.success("ok");
    toast.error("bad");
    toast.warning("careful");
    toast.info("fyi");
    expect(getToasts().map((t) => t.variant)).toEqual([
      "success",
      "error",
      "warning",
      "info",
    ]);
  });

  it("carries description + duration options", () => {
    toast.success("Saved", { description: "Profile updated", duration: 1234 });
    const [t] = getToasts();
    expect(t).toMatchObject({
      title: "Saved",
      description: "Profile updated",
      duration: 1234,
    });
  });

  it("defaults the duration when unspecified", () => {
    toast("x");
    expect(getToasts()[0]?.duration).toBe(5000);
  });

  it("keeps Infinity (persistent) but rejects negative/NaN durations", () => {
    toast("persist", { duration: Infinity });
    toast("neg", { duration: -1 });
    toast("nan", { duration: Number.NaN });
    expect(getToasts().map((t) => t.duration)).toEqual([Infinity, 5000, 5000]);
  });

  it("dismisses a single toast by id, leaving the rest", () => {
    const a = toast("a");
    toast("b");
    toast.dismiss(a);
    expect(getToasts().map((t) => t.title)).toEqual(["b"]);
  });

  it("dismisses everything when called with no id", () => {
    toast("a");
    toast("b");
    toast.dismiss();
    expect(getToasts()).toEqual([]);
  });
});
