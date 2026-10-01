import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  README_SEEN_KEY,
  markReadmeSeen,
  readmeSeen,
  resetReadmeSeenForTests,
  subscribeReadmeSeen,
} from "./readme-seen";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const blocked = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

beforeEach(() => resetReadmeSeenForTests());

describe("readmeSeen", () => {
  it("is false for a first visit, so the icon glows", () => {
    expect(readmeSeen(memoryStore())).toBe(false);
  });

  it("remembers an opened README on this device", () => {
    const store = memoryStore();
    markReadmeSeen(store);
    expect(store.data.get(README_SEEN_KEY)).toBe("1");
    // A returning visitor: a new page load, the same storage.
    resetReadmeSeenForTests();
    expect(readmeSeen(store)).toBe(true);
  });

  it("glows every visit when storage is blocked, but stops once opened", () => {
    expect(readmeSeen(blocked)).toBe(false);
    expect(() => markReadmeSeen(blocked)).not.toThrow();
    expect(readmeSeen(blocked)).toBe(true);
    resetReadmeSeenForTests();
    expect(readmeSeen(blocked)).toBe(false);
  });

  it("tells subscribers once, the first time", () => {
    const listener = vi.fn();
    subscribeReadmeSeen(listener);
    markReadmeSeen(memoryStore());
    markReadmeSeen(memoryStore());
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
