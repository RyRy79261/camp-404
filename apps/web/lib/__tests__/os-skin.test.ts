import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OS_SKIN_CLASS, OS_SKIN_SCRIPT } from "../os-skin";

// The skin's class on <html> follows the `data-os-skin` marker, the way
// `:root:has([data-os-skin])` did, without the whole-document restyle that
// selector cost on every DOM change (lib/os-skin.ts).

const css = readFileSync(
  path.join(__dirname, "../../app/globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** After the MutationObserver's callback (a microtask) has run. */
const settled = () => new Promise((r) => setTimeout(r, 0));
const skinned = () =>
  document.documentElement.classList.contains(OS_SKIN_CLASS);

describe("the skin's class on <html>", () => {
  beforeAll(() => {
    // As the root layout's head does: once, before any body content.
    new Function(OS_SKIN_SCRIPT)();
  });
  afterEach(async () => {
    document.body.replaceChildren();
    await settled();
  });

  it("is off on a page with no marker", async () => {
    document.body.innerHTML = "<main><h1>Sign in</h1></main>";
    await settled();
    expect(skinned()).toBe(false);
  });

  it("comes on when a marked element arrives, however deep, and goes with it", async () => {
    const outer = document.createElement("div");
    outer.innerHTML =
      "<section><div data-os-skin><h1>Tasks</h1></div></section>";
    document.body.append(outer);
    await settled();
    expect(skinned()).toBe(true);

    // A window's content changing leaves it on.
    outer.querySelector("h1")!.replaceWith(document.createElement("p"));
    await settled();
    expect(skinned()).toBe(true);

    outer.remove();
    await settled();
    expect(skinned()).toBe(false);
  });

  it("follows the attribute on an element already there", async () => {
    const main = document.createElement("main");
    document.body.append(main);
    await settled();
    expect(skinned()).toBe(false);
    main.setAttribute("data-os-skin", "");
    await settled();
    expect(skinned()).toBe(true);
    main.removeAttribute("data-os-skin");
    await settled();
    expect(skinned()).toBe(false);
  });

  it("is what the stylesheet keys the skin on, and no rule asks :root:has()", () => {
    expect(css).not.toMatch(/:root:has\(/);
    expect(css).not.toContain("[data-os-skin]");
    const keyed = css.match(/:root\.[\w-]+/g) ?? [];
    expect(keyed.length).toBeGreaterThan(40);
    expect(new Set(keyed)).toEqual(new Set([`:root.${OS_SKIN_CLASS}`]));
  });
});
