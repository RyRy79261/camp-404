// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A window's --win-* variables change on every frame of a drag or resize. As
// plain custom properties they are inherited, so each change restyled every
// element in the window's page. Registered as not inherited, only the frame
// is restyled. Every --win-* variable the frame sets must stay registered so.
const css = readFileSync(
  new URL("../../../../../packages/os/src/styles.css", import.meta.url),
  "utf8",
);
const frame = readFileSync(
  new URL("../../../../../packages/os/src/os-window.tsx", import.meta.url),
  "utf8",
);

describe("the window's place and size variables", () => {
  const used = [...new Set(frame.match(/--win-[a-z]+/g) ?? [])];

  it("are the four the frame sets", () => {
    expect(used.sort()).toEqual(["--win-h", "--win-w", "--win-x", "--win-y"]);
  });

  it.each(used)("%s is registered as not inherited", (name) => {
    const rule = new RegExp(
      `@property\\s+${name}\\s*\\{[^}]*inherits:\\s*false`,
    );
    expect(css).toMatch(rule);
  });
});
