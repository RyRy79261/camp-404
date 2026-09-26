import { afterEach, describe, expect, it } from "vitest";
import type { OsWindow } from "@camp404/os";
import {
  forgetAllWindows,
  forgetOtherMembers,
  parseWindows,
  serializeWindows,
  windowStorageKey,
} from "../window-storage";

// The desktop's window stack in sessionStorage: layout only, never trusted.

const RECT = { x: 10, y: 20, w: 400, h: 300 };

function stored(windows: unknown[], mode = "full"): string {
  return JSON.stringify({ mode, windows });
}

const page = (key: string, lastUrl: string, extra: object = {}) => ({
  key,
  programId: "whatever-the-browser-said",
  lastUrl,
  rect: RECT,
  z: 1,
  minimized: false,
  maximized: false,
  scrollTop: 0,
  ...extra,
});

const noFolders = () => false;

afterEach(() => window.sessionStorage.clear());

describe("serializeWindows", () => {
  it("writes layout only, never a title", () => {
    const windows: OsWindow<string>[] = [
      {
        id: "meeting:m-1",
        program: "meeting",
        lastUrl: "/meetings/m-1",
        title: "Secret plans with Ada",
        ...RECT,
        z: 2,
      },
    ];
    const text = serializeWindows(
      windows,
      "full",
      new Map([["meeting:m-1", 80]]),
    );
    expect(text).not.toContain("Secret plans");
    expect(text).not.toContain("title");
    expect(JSON.parse(text)).toEqual({
      mode: "full",
      windows: [
        {
          key: "meeting:m-1",
          programId: "meeting",
          lastUrl: "/meetings/m-1",
          rect: RECT,
          z: 2,
          minimized: false,
          maximized: false,
          scrollTop: 80,
        },
      ],
    });
  });
});

describe("parseWindows", () => {
  it("keeps a console page's window and works its program out from the address", () => {
    const { windows, scrollTops } = parseWindows(
      stored([page("meeting:m-1", "/meetings/m-1", { scrollTop: 120 })]),
      "full",
      noFolders,
    );
    expect(windows).toEqual([
      {
        id: "meeting:m-1",
        program: "meeting",
        lastUrl: "/meetings/m-1",
        ...RECT,
        z: 1,
      },
    ]);
    expect(scrollTops.get("meeting:m-1")).toBe(120);
  });

  it("prunes a team page by the team's own program id", () => {
    const { windows } = parseWindows(
      stored([page("team:kitchen", "/teams/kitchen")]),
      "full",
      noFolders,
    );
    expect(windows[0]?.program).toBe("team:kitchen");
  });

  it("drops every address that is not a console page", () => {
    const bad = [
      "https://evil.example/tasks",
      "//evil.example/tasks",
      "/\\evil.example",
      "/api/test/reset",
      "/auth/sign-out",
      "/captains/camp-management/export",
      "/no-such-page",
      "/",
      "javascript:alert(1)",
    ];
    const { windows } = parseWindows(
      stored(bad.map((url, i) => page(`w${i}`, url))),
      "full",
      noFolders,
    );
    expect(windows).toEqual([]);
  });

  it("drops an address a browser would read differently (a tab inside)", () => {
    // Only the safeInternalPath form of an address is ever stored.
    const { windows } = parseWindows(
      stored([page("tasks", "/tasks?team=\tkitchen")]),
      "full",
      noFolders,
    );
    expect(windows).toEqual([]);
  });

  it("drops a window whose key is not its address's window", () => {
    const { windows } = parseWindows(
      stored([page("audit", "/tasks")]),
      "full",
      noFolders,
    );
    expect(windows).toEqual([]);
  });

  it("keeps a folder window only when the desktop knows the folder", () => {
    const folder = { ...page("folder:teams", ""), lastUrl: null };
    const unknown = { ...page("folder:secret", ""), lastUrl: null };
    const { windows } = parseWindows(
      stored([folder, unknown]),
      "full",
      (key) => key === "folder:teams",
    );
    expect(windows.map((w) => w.id)).toEqual(["folder:teams"]);
    expect(windows[0]?.lastUrl).toBeUndefined();
  });

  it("starts afresh under another mode, and on anything unreadable", () => {
    const text = stored([page("tasks", "/tasks")], "full");
    expect(parseWindows(text, "restricted", noFolders).windows).toEqual([]);
    expect(parseWindows("{not json", "full", noFolders).windows).toEqual([]);
    expect(parseWindows(null, "full", noFolders).windows).toEqual([]);
    expect(
      parseWindows(
        stored([{ ...page("tasks", "/tasks"), rect: { x: "1" } }]),
        "full",
        noFolders,
      ).windows,
    ).toEqual([]);
  });

  it("never reads a stored title back", () => {
    const { windows } = parseWindows(
      stored([page("tasks", "/tasks", { title: "Ada's tasks" })]),
      "full",
      noFolders,
    );
    expect(windows[0]).not.toHaveProperty("title");
  });
});

describe("forgetting", () => {
  it("forgets other members' stacks, and everyone's on sign-out", () => {
    const store = window.sessionStorage;
    store.setItem(windowStorageKey("me"), "a");
    store.setItem(windowStorageKey("someone-else"), "b");
    store.setItem("unrelated", "c");
    forgetOtherMembers(store, "me");
    expect(store.getItem(windowStorageKey("me"))).toBe("a");
    expect(store.getItem(windowStorageKey("someone-else"))).toBeNull();
    forgetAllWindows(store);
    expect(store.getItem(windowStorageKey("me"))).toBeNull();
    expect(store.getItem("unrelated")).toBe("c");
  });
});
