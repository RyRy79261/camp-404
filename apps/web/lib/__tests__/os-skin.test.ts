import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OS_SKIN_CLASS, OS_SKIN_SCRIPT, OS_THEME_ATTRIBUTES } from "../os-skin";

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

  it("copies the desktop's theme and switches to <html>, follows a change, and drops them with it", async () => {
    const html = document.documentElement;
    const desk = document.createElement("div");
    desk.setAttribute("data-os-skin", "");
    desk.setAttribute("data-os-theme", "calm");
    desk.setAttribute("data-os-text", "bigger");
    document.body.append(desk);
    await settled();
    expect(html.getAttribute("data-os-theme")).toBe("calm");
    expect(html.getAttribute("data-os-text")).toBe("bigger");
    expect(html.hasAttribute("data-os-effects")).toBe(false);

    desk.setAttribute("data-os-theme", "high-contrast");
    desk.setAttribute("data-os-effects", "off");
    desk.removeAttribute("data-os-text");
    await settled();
    expect(html.getAttribute("data-os-theme")).toBe("high-contrast");
    expect(html.getAttribute("data-os-effects")).toBe("off");
    expect(html.hasAttribute("data-os-text")).toBe(false);

    desk.remove();
    await settled();
    for (const attr of OS_THEME_ATTRIBUTES) {
      expect(html.hasAttribute(attr)).toBe(false);
    }
  });

  it("never themes a page whose skinned element has no theme (a gate screen)", async () => {
    const gate = document.createElement("main");
    gate.setAttribute("data-os-skin", "");
    document.body.append(gate);
    await settled();
    expect(skinned()).toBe(true);
    expect(document.documentElement.hasAttribute("data-os-theme")).toBe(false);
  });

  it("takes no theme from an element that is not skinned (the landing page)", async () => {
    const stray = document.createElement("div");
    stray.setAttribute("data-os-theme", "calm");
    document.body.append(stray);
    await settled();
    expect(document.documentElement.hasAttribute("data-os-theme")).toBe(false);
  });
});
