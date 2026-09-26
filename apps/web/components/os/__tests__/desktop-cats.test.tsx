import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PEEK_MS } from "@camp404/games/cats";
import { SHADOW_WORK_STRIP_H as STRIP_H } from "@camp404/games/shadow-work";
import { FEED_WAIT_MS, WindowPeek } from "../cats-on-desktop";
import { SHADOW_WORK_STRIP_PX } from "../desktop-cats";

// The desktop's cats are decoration, and the owner worries about computing
// power: no game may be in the desktop's first bundle. Only
// cats-on-desktop.tsx imports @camp404/games/cats and /shadow-work, and
// only through a dynamic import() is it ever reached.

const WEB = path.resolve(__dirname, "../../..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "tests") {
      continue;
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") out.push(...sources(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g;

function staticImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(STATIC_IMPORT)].map((m) => m[1]!);
}

describe("the cats stay out of the first bundle", () => {
  const files = ["app", "components", "lib"].flatMap((d) =>
    sources(path.join(WEB, d)),
  );

  it("imports a game statically only in the lazily loaded placements", () => {
    const offenders = files.filter(
      (f) =>
        !f.endsWith(path.join("os", "cats-on-desktop.tsx")) &&
        staticImports(f).some(
          (s) => s.startsWith("@camp404/games") && !s.endsWith(".css"),
        ),
    );
    expect(offenders.map((f) => path.relative(WEB, f))).toEqual([]);
  });

  it("reaches the placements only through import()", () => {
    const offenders = files.filter((f) =>
      staticImports(f).some((s) => s.endsWith("/cats-on-desktop")),
    );
    expect(offenders.map((f) => path.relative(WEB, f))).toEqual([]);
    const lazy = readFileSync(
      path.join(WEB, "components/os/desktop-cats.tsx"),
      "utf8",
    );
    expect(lazy).toContain('import("./cats-on-desktop")');
  });

  it("keeps Shadow Work's strip height while it loads", () => {
    expect(SHADOW_WORK_STRIP_PX).toBe(STRIP_H);
  });
});

describe("WindowPeek", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("peeks at once after a feed, and not for an old one", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<WindowPeek fedAt={0} />);
    expect(container.querySelector(".cat-peek")).toBeNull();

    // A feed from before this window was focused (long ago): nothing.
    rerender(<WindowPeek fedAt={Date.now() - FEED_WAIT_MS - 1} />);
    expect(container.querySelector(".cat-peek")).toBeNull();

    rerender(<WindowPeek fedAt={Date.now()} />);
    expect(container.querySelector(".cat-peek")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(PEEK_MS + 10);
    });
    expect(container.querySelector(".cat-peek")).toBeNull();
  });

  it("still peeks when it arrives a moment after the feed (a slow chunk)", () => {
    vi.useFakeTimers();
    const fedAt = Date.now();
    vi.advanceTimersByTime(FEED_WAIT_MS / 2);
    const { container } = render(<WindowPeek fedAt={fedAt} />);
    expect(container.querySelector(".cat-peek")).not.toBeNull();
  });
});
