import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Label } from "@camp404/ui/components/label";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { Toaster, toast } from "@camp404/ui/components/toast";

// Inside a 404 OS window the kit's parts wear the prototype's kit
// (_proto/kit.tsx: FieldLabel, Kpi, Tabs, ProgressBar, the toast): the skin
// in app/globals.css finds each by a marker the part carries. Both halves
// are checked: the part carries its marker, and the skin has a rule for it
// that sets the pixel face (or, for the toast's icon, hides it).

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

/** The body of the skin rule whose selector list names `selector`. */
function ruleFor(selector: string): string {
  const re = /([^{};]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const selectors = m[1]!.split(",").map((s) => s.trim());
    if (selectors.includes(`:root:has([data-os-skin]) ${selector}`)) {
      return m[2]!;
    }
  }
  throw new Error(`no skin rule for ${selector}`);
}

afterEach(() => {
  cleanup();
  toast.dismiss();
});

describe("the kit's parts inside the 404 OS skin", () => {
  it("draws a field's label in small pixel capitals, quiet (the prototype's FieldLabel)", () => {
    render(<Label htmlFor="x">Search</Label>);
    expect(screen.getByText("Search").getAttribute("data-slot")).toBe("label");
    for (const slot of ['[data-slot="label"]', '[data-slot="field-label"]']) {
      const body = ruleFor(slot);
      expect(body).toContain("font-family: var(--os-font-pixel)");
      expect(body).toContain("font-size: 10px");
      expect(body).toContain("text-transform: uppercase");
      expect(body).toContain("color: var(--os-muted)");
    }
  });

  it("draws a headline number's label and figure in the pixel face, on a tile with a coloured edge", () => {
    expect(ruleFor("[data-kpi-label]")).toContain(
      "font-family: var(--os-font-pixel)",
    );
    expect(ruleFor("[data-kpi-value]")).toContain(
      "font-family: var(--os-font-pixel)",
    );
    expect(ruleFor('[data-kpi="accent"]')).toContain(
      "inset 3px 0 0 0 var(--os-accent)",
    );
  });

  it("draws a filter chip as the prototype's roster chip, its count in a box", () => {
    expect(ruleFor('[data-slot="filter-chip"]')).toContain(
      "font-family: var(--os-font-pixel)",
    );
    expect(ruleFor('[data-slot="filter-chip"][aria-pressed="true"]')).toContain(
      "border-color: var(--os-primary)",
    );
    expect(ruleFor('[data-slot="filter-chip-count"]')).toContain(
      "font-family: var(--os-font-mono)",
    );
  });

  it("cuts a progress bar into blocks", () => {
    render(<ProgressBar value={40} label="Progress" />);
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar.getAttribute("data-slot")).toBe("progress");
    expect(bar.firstElementChild?.getAttribute("data-slot")).toBe(
      "progress-fill",
    );
    expect(ruleFor('[data-slot="progress-fill"]')).toContain(
      "repeating-linear-gradient",
    );
  });

  it("gives a toast the magenta stripe and a small pixel title, and no icon", () => {
    render(<Toaster />);
    act(() => {
      toast("Meow", { description: "Paw prints follow your pointer." });
    });
    const card = screen.getByRole("status");
    expect(card.getAttribute("data-slot")).toBe("toast");
    expect(card.querySelector('[data-slot="toast-title"]')?.textContent).toBe(
      "Meow",
    );
    expect(card.querySelector('[data-slot="toast-icon"]')).not.toBeNull();
    expect(ruleFor('[data-slot="toast"]')).toContain(
      "inset 4px 0 0 0 var(--os-primary)",
    );
    expect(ruleFor('[data-slot="toast-icon"]')).toContain("display: none");
    expect(ruleFor('[data-slot="toast-title"]')).toContain(
      "font-family: var(--os-font-pixel)",
    );
  });

  it("sets figures in the system's monospace, as the prototype and Join, not JetBrains Mono", () => {
    expect(css).toMatch(/--font-mono: var\(--os-font-mono\)/);
    expect(css).toMatch(/--os-font-mono: ui-monospace, SFMono-Regular/);
  });
});
